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
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');
const steps = require('./steps');
const {
  ROOT, OUTPUT_DIR, PORT, API, EMULATOR, sleep, log, CheckFailed,
  requireEmulator, prepareWorkDir, resetEmulator, startBackend, synthesizeNarration, muxVideo, captionFor,
} = require('./lib/common');

const OUTPUT_FILE = path.join(OUTPUT_DIR, 'cartly-e2e.mp4');
const VIEWPORT = { width: 1280, height: 720 };
const ACTION_GAP_MS = 700;
const STEP_TAIL_MS = 600;

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

async function main() {
  requireEmulator();
  const workDir = prepareWorkDir('api');

  log('Generating narration...');
  const clips = synthesizeNarration([...steps.map((s) => s.narration), steps.failureNarration], workDir);
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
      recordVideo: { dir: workDir, size: VIEWPORT },
    });
    const page = await context.newPage();
    const videoStart = Date.now();
    await page.goto(`${pathToFileURL(path.join(ROOT, 'demo.html')).href}?api=${encodeURIComponent(API)}`);
    await sleep(800);

    const t = createContext(page);
    for (const [i, step] of steps.entries()) {
      log(`Step ${i + 1}/${steps.length}: ${step.title}`);
      await page.evaluate(([n, total, title, text]) => window.demo.setStep(n, total, title, text), [
        i + 1, steps.length, step.title, captionFor(step.narration),
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
    muxVideo(videoFile, timeline, OUTPUT_FILE);
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
