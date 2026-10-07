#!/usr/bin/env node
/**
 * Narrated end-to-end test of the Cartly API.
 *
 * 1. Starts the built NestJS backend against the Firestore Emulator.
 * 2. Generates narration WAVs with Windows text-to-speech.
 * 3. Drives demo.html in Chromium (Playwright) while recording video; every
 *    step makes real HTTP calls and asserts on the responses.
 * 4. Mixes the narration onto the recording with ffmpeg -> output/cartly-e2e.mp4.
 *
 * Exits non-zero if any check fails (the video is still produced).
 */
const { spawn, execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');
const steps = require('./steps');

const ROOT = __dirname;
const BACKEND_DIR = path.resolve(ROOT, '../backend');
const OUTPUT_DIR = path.join(ROOT, 'output');
const WORK_DIR = path.join(OUTPUT_DIR, '.work');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'cartly-e2e.mp4');
const PORT = Number(process.env.DEMO_PORT) || 3100;
const API = `http://127.0.0.1:${PORT}/api`;
const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'cartly-dev';
const EMULATOR = process.env.FIRESTORE_EMULATOR_HOST;
const VIEWPORT = { width: 1280, height: 720 };
const ACTION_GAP_MS = 700;
const STEP_TAIL_MS = 600;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (msg) => console.log(`[e2e-video] ${msg}`);

/** FFMPEG_PATH, then ffmpeg on PATH, then the ffmpeg-static download. */
function ffmpegBinary() {
  if (process.env.FFMPEG_PATH) return process.env.FFMPEG_PATH;
  try {
    execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' });
    return 'ffmpeg';
  } catch {
    return require('ffmpeg-static');
  }
}

async function resetEmulator() {
  const url = `http://${EMULATOR}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
  const res = await fetch(url, { method: 'DELETE' });
  if (!res.ok) throw new Error(`Could not reset the Firestore Emulator (${res.status})`);
}

async function startBackend() {
  const main = path.join(BACKEND_DIR, 'dist', 'main.js');
  if (!fs.existsSync(main)) throw new Error('backend/dist/main.js not found. Run "npm run build" in backend/.');

  const child = spawn(process.execPath, [main], {
    cwd: BACKEND_DIR,
    env: { ...process.env, PORT: String(PORT), FIREBASE_PROJECT_ID: PROJECT_ID, FIRESTORE_EMULATOR_HOST: EMULATOR },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', (d) => (output += d));
  child.stderr.on('data', (d) => (output += d));

  for (let i = 0; i < 60; i++) {
    if (child.exitCode !== null) throw new Error(`Backend exited early:\n${output}`);
    try {
      const res = await fetch(`${API}/items`);
      if (res.status === 401) return child;
    } catch {
      /* not listening yet */
    }
    await sleep(500);
  }
  child.kill();
  throw new Error(`Backend did not start on port ${PORT}:\n${output}`);
}

function wavDurationMs(file) {
  const buf = fs.readFileSync(file);
  let offset = 12;
  let byteRate = 0;
  while (offset + 8 <= buf.length) {
    const id = buf.toString('ascii', offset, offset + 4);
    const size = buf.readUInt32LE(offset + 4);
    if (id === 'fmt ') byteRate = buf.readUInt32LE(offset + 16);
    if (id === 'data') return Math.round((size / byteRate) * 1000);
    offset += 8 + size + (size % 2);
  }
  throw new Error(`Could not read WAV duration of ${file}`);
}

function synthesizeNarration(texts) {
  const manifest = texts.map((text, i) => ({ text, file: path.join(WORK_DIR, `clip-${i}.wav`) }));
  const manifestPath = path.join(WORK_DIR, 'narration.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest));
  execFileSync(
    'powershell.exe',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(ROOT, 'tts.ps1'), manifestPath],
    { stdio: 'inherit' },
  );
  return manifest.map((m) => ({ file: m.file, durationMs: wavDurationMs(m.file) }));
}

class CheckFailed extends Error {}

function createContext(page) {
  const evaluate = (fn, ...args) => page.evaluate(fn, args);
  const t = {
    async call(method, apiPath, { user, body } = {}) {
      const res = await evaluate(([m, p, u, b]) => window.demo.call(m, p, u, b), method, apiPath, user, body);
      await sleep(ACTION_GAP_MS);
      return res;
    },
    async expect(ok, label) {
      await evaluate(([o, l]) => window.demo.check(o, l), ok, label);
      console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}`);
      if (!ok) throw new CheckFailed(label);
      await sleep(150);
    },
    async expectStatus(res, status, label) {
      await t.expect(res.status === status, res.status === status ? label : `${label} (got ${res.status})`);
    },
    async expectOrder(names, expected) {
      const ok = JSON.stringify(names) === JSON.stringify(expected);
      await t.expect(ok, `Order is ${expected.join(', ')}${ok ? '' : ` (got ${names.join(', ') || 'empty'})`}`);
    },
    async refresh(user) {
      const res = await t.call('GET', '/items', { user });
      if (res.status !== 200) throw new CheckFailed(`GET /items for ${user} returned ${res.status}`);
      await evaluate(([u, items]) => window.demo.renderList(u, items), user, res.body.items);
      return res.body.items.map((i) => i.name);
    },
    async finish(ok, text) {
      await evaluate(([o, x]) => window.demo.finish(o, x), ok, text);
    },
  };
  return t;
}

function muxVideo(videoFile, timeline) {
  const args = ['-y', '-loglevel', 'error', '-i', videoFile];
  timeline.forEach(({ clip }) => args.push('-i', clip.file));
  const delays = timeline.map(({ startMs }, i) => `[${i + 1}:a]adelay=delays=${startMs}:all=1[a${i}]`);
  const labels = timeline.map((_, i) => `[a${i}]`).join('');
  const filter = `${delays.join(';')};${labels}amix=inputs=${timeline.length}:normalize=0:duration=longest[aout]`;
  args.push(
    '-filter_complex', filter,
    '-map', '0:v', '-map', '[aout]',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '22', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '160k',
    '-movflags', '+faststart',
    OUTPUT_FILE,
  );
  execFileSync(ffmpegBinary(), args, { stdio: 'inherit' });
}

async function main() {
  if (!EMULATOR) {
    throw new Error('FIRESTORE_EMULATOR_HOST is not set. Use "npm run record", which starts the emulator.');
  }
  fs.rmSync(WORK_DIR, { recursive: true, force: true });
  fs.mkdirSync(WORK_DIR, { recursive: true });

  log('Generating narration...');
  const clips = synthesizeNarration([...steps.map((s) => s.narration), steps.failureNarration]);
  const failureClip = clips.pop();

  log(`Resetting emulator at ${EMULATOR} and starting backend on port ${PORT}...`);
  await resetEmulator();
  const backend = await startBackend();

  let failed = null;
  const timeline = [];
  try {
    const browser = await chromium.launch();
    const context = await browser.newContext({
      viewport: VIEWPORT,
      recordVideo: { dir: WORK_DIR, size: VIEWPORT },
    });
    const page = await context.newPage();
    const videoStart = Date.now();
    await page.goto(`${pathToFileURL(path.join(ROOT, 'demo.html')).href}?api=${encodeURIComponent(API)}`);
    await sleep(800);

    const t = createContext(page);
    for (const [i, step] of steps.entries()) {
      log(`Step ${i + 1}/${steps.length}: ${step.title}`);
      await page.evaluate(([n, total, title, text]) => window.demo.setStep(n, total, title, text), [
        i + 1, steps.length, step.title, step.narration.replace(/ J S/g, 'JS').replace(/I D/g, 'ID'),
      ]);
      const startMs = Date.now() - videoStart;
      timeline.push({ clip: clips[i], startMs });
      try {
        await step.run(t);
      } catch (err) {
        failed = err;
      }
      const remaining = clips[i].durationMs + STEP_TAIL_MS - (Date.now() - videoStart - startMs);
      if (remaining > 0) await sleep(remaining);

      if (failed) {
        await t.finish(false, `Check failed: ${failed.message}`);
        timeline.push({ clip: failureClip, startMs: Date.now() - videoStart });
        await sleep(failureClip.durationMs + STEP_TAIL_MS);
        break;
      }
    }
    await sleep(1500);

    const video = page.video();
    await context.close();
    const videoFile = await video.path();
    await browser.close();

    log('Mixing narration into the video...');
    muxVideo(videoFile, timeline);
    log(`Saved ${path.relative(process.cwd(), OUTPUT_FILE)}`);
  } finally {
    backend.kill();
  }

  if (failed) {
    console.error(`[e2e-video] FAILED: ${failed.message}`);
    process.exitCode = 1;
  } else {
    log('All checks passed.');
  }
}

main().catch((err) => {
  console.error(`[e2e-video] ${err.stack || err}`);
  process.exit(1);
});
