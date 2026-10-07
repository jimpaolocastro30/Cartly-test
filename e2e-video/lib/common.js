const { spawn, execFileSync } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const BACKEND_DIR = path.resolve(ROOT, '../backend');
const OUTPUT_DIR = path.join(ROOT, 'output');
const PORT = Number(process.env.DEMO_PORT) || 3100;
const API = `http://127.0.0.1:${PORT}/api`;
const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'cartly-dev';
const EMULATOR = process.env.FIRESTORE_EMULATOR_HOST;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (msg) => console.log(`[e2e-video] ${msg}`);

class CheckFailed extends Error {}

function requireEmulator() {
  if (!EMULATOR) {
    throw new Error('FIRESTORE_EMULATOR_HOST is not set. Use the npm "record" scripts, which start the emulator.');
  }
}

function prepareWorkDir(name) {
  const dir = path.join(OUTPUT_DIR, `.work-${name}`);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

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

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.ico': 'image/x-icon', '.wasm': 'application/wasm',
  '.otf': 'font/otf', '.ttf': 'font/ttf', '.frag': 'text/plain', '.bin': 'application/octet-stream',
};

/** Serves URL prefixes from directories, e.g. { '/app/': 'mobile/build/web' }. */
function startStaticServer(port, mounts) {
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const prefix = Object.keys(mounts).find((p) => url.startsWith(p));
    if (!prefix) {
      res.writeHead(404).end();
      return;
    }
    const base = path.resolve(mounts[prefix]);
    let file = path.resolve(base, '.' + url.slice(prefix.length - 1));
    if (!file.startsWith(base)) {
      res.writeHead(403).end();
      return;
    }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!fs.existsSync(file)) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve(server)));
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

/** Windows text-to-speech for each text; returns [{ file, durationMs }]. */
function synthesizeNarration(texts, workDir) {
  const manifest = texts.map((text, i) => ({ text, file: path.join(workDir, `clip-${i}.wav`) }));
  const manifestPath = path.join(workDir, 'narration.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest));
  execFileSync(
    'powershell.exe',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(ROOT, 'tts.ps1'), manifestPath],
    { stdio: 'inherit' },
  );
  return manifest.map((m) => ({ file: m.file, durationMs: wavDurationMs(m.file) }));
}

/** Mixes narration clips (each starting at startMs) onto the recorded video. */
function muxVideo(videoFile, timeline, outputFile) {
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
    outputFile,
  );
  execFileSync(ffmpegBinary(), args, { stdio: 'inherit' });
}

/** Spoken text spells out acronyms; the on-screen caption should not. */
function captionFor(narration) {
  return narration.replace(/ J S/g, 'JS').replace(/I D/g, 'ID');
}

module.exports = {
  ROOT, OUTPUT_DIR, PORT, API, EMULATOR,
  sleep, log, CheckFailed,
  requireEmulator, prepareWorkDir, resetEmulator, startBackend, startStaticServer,
  synthesizeNarration, muxVideo, captionFor,
};
