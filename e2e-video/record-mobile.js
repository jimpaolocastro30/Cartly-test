#!/usr/bin/env node
/**
 * Narrated end-to-end test of the Cartly Flutter app on a simulated phone.
 *
 * The real Flutter web build (mobile/build/web) runs inside a phone frame in
 * Chromium. Playwright taps and types through Flutter's accessibility tree with
 * real mouse/keyboard input, while the NestJS backend talks to the Firestore
 * Emulator. Narration (Windows TTS) is mixed in -> output/cartly-mobile-e2e.mp4.
 *
 * Build the app first (see the "build:mobile-web" npm script). Exits non-zero if
 * any check fails; the video is still produced.
 */
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const steps = require('./mobile-steps');
const {
  ROOT, OUTPUT_DIR, API, EMULATOR, sleep, log, CheckFailed,
  requireEmulator, prepareWorkDir, resetEmulator, startBackend, startStaticServer,
  synthesizeNarration, muxVideo, captionFor,
} = require('./lib/common');

const APP_DIR = path.resolve(ROOT, '../mobile/build/web');
const HARNESS_PORT = Number(process.env.HARNESS_PORT) || 3200;
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'cartly-mobile-e2e.mp4');
const VIEWPORT = { width: 1280, height: 720 };
const USER = 'alice';
const TAP_GAP_MS = 650;
const TYPE_DELAY_MS = 70;
const STEP_TAIL_MS = 600;
const WAIT_TIMEOUT_MS = 12000;

async function api(method, apiPath, user, body) {
  const res = await fetch(`${API}${apiPath}`, {
    method,
    headers: { 'X-User-ID': user, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

/** Runs in the app frame: finds a semantics node or input by role and accessible name. */
function findNodeRect({ role, name }) {
  const re = name.regex ? new RegExp(name.regex, name.flags) : null;
  const label = (e) => (e.getAttribute('aria-label') || e.textContent || '').trim();
  const node = [...document.querySelectorAll('flt-semantics, input, textarea')].find((e) => {
    if (role && e.getAttribute('role') !== role) return false;
    const l = label(e);
    return re ? re.test(l) : l === name.text;
  });
  if (!node) return null;
  const r = node.getBoundingClientRect();
  return r.width && r.height ? { x: r.x, y: r.y, width: r.width, height: r.height } : null;
}

/** Runs in the app frame: list rows in display order with section and checkbox state. */
function readListInFrame() {
  const nodes = [...document.querySelectorAll('flt-semantics')];
  const label = (e) => (e.getAttribute('aria-label') || e.textContent || '').trim();
  const header = nodes.find((e) => label(e) === 'Bought' && e.getAttribute('role') !== 'button');
  const headerY = header ? header.getBoundingClientRect().y : Infinity;
  const checkboxes = nodes.filter((e) => e.getAttribute('role') === 'checkbox');
  const tiles = nodes.filter(
    (e) => e.getAttribute('role') === 'button' && /\nx\d+$/.test(e.getAttribute('aria-label') || ''),
  );
  return tiles.map((tile, i) => {
    const [name] = tile.getAttribute('aria-label').split('\n');
    const box = tile.querySelector('[role="checkbox"]') || checkboxes[i];
    const checked = box ? box.getAttribute('aria-checked') === 'true' : null;
    const inBoughtSection = tile.getBoundingClientRect().y > headerY;
    if (checked !== inBoughtSection) return `? ${name}`;
    return checked ? `[x] ${name}` : name;
  });
}

function hasTextInFrame({ regex, flags }) {
  const re = new RegExp(regex, flags);
  return [...document.querySelectorAll('flt-semantics, input')].some((e) =>
    re.test((e.getAttribute('aria-label') || '') + ' ' + (e.textContent || '')),
  );
}

const toName = (name) =>
  name instanceof RegExp ? { regex: name.source, flags: name.flags } : { text: name };

function createDriver(page, control) {
  const frame = () => page.frame({ url: /\/app\// });

  const t = {
    async openApp() {
      await page.evaluate(() => {
        document.getElementById('app').src = `/app/?t=${Date.now()}`;
      });
      await sleep(500);
      const f = frame();
      await f.waitForSelector('flt-semantics-placeholder', { state: 'attached', timeout: 30000 });
      await f.locator('flt-semantics-placeholder').dispatchEvent('click');
      await sleep(800);
    },

    async rect(target, timeout = WAIT_TIMEOUT_MS) {
      const query = { role: target.role, name: toName(target.name) };
      const deadline = Date.now() + timeout;
      while (Date.now() < deadline) {
        const r = await frame().evaluate(findNodeRect, query).catch(() => null);
        if (r) return r;
        await sleep(150);
      }
      throw new CheckFailed(`Could not find "${target.name}" on screen`);
    },

    /** Real mouse tap at the element (or at offsetX from its left edge), with a visible tap marker. */
    async tap(target, { offsetX } = {}) {
      const r = await t.rect(target);
      const appBox = await page.locator('#app').boundingBox();
      const x = appBox.x + r.x + (offsetX ?? r.width / 2);
      const y = appBox.y + r.y + r.height / 2;
      await page.evaluate(([px, py]) => window.demo.tap(px, py), [x, y]);
      await sleep(200);
      await page.mouse.click(x, y);
      await sleep(TAP_GAP_MS);
    },

    async type(target, text) {
      await t.tap(target);
      await page.keyboard.press('Control+A');
      await page.keyboard.press('Backspace');
      if (text) await page.keyboard.type(text, { delay: TYPE_DELAY_MS });
      await sleep(300);
    },

    async addItem(name, quantity, { dialogOpen = false } = {}) {
      if (!dialogOpen) await t.tap({ role: 'button', name: 'Add item' });
      await t.type({ name: 'Item name' }, name);
      await t.type({ name: 'Quantity' }, String(quantity));
      await t.tap({ role: 'button', name: 'Add' });
      const added = await t.waitFor(async () => !(await t.dialogOpen()) && (await t.listContains(name)));
      await t.expect(added, `${name} added (x${quantity})`);
    },

    async dialogOpen() {
      return frame()
        .evaluate(() => !!document.querySelector('[role="alertdialog"]'))
        .catch(() => false);
    },

    async toggle(name) {
      await t.tap({ role: 'button', name: new RegExp(`^${name}\\nx\\d+$`) }, { offsetX: 28 });
    },

    async readList() {
      return frame().evaluate(readListInFrame).catch(() => []);
    },

    async listContains(name) {
      return (await t.readList()).some((row) => row.replace('[x] ', '') === name);
    },

    async hasText(regex) {
      return frame().evaluate(hasTextInFrame, { regex: regex.source, flags: regex.flags }).catch(() => false);
    },

    async waitFor(predicate, timeout = WAIT_TIMEOUT_MS) {
      const deadline = Date.now() + timeout;
      while (Date.now() < deadline) {
        if (await predicate()) return true;
        await sleep(200);
      }
      return false;
    },

    waitForText(regex) {
      return t.waitFor(() => t.hasText(regex));
    },

    async expect(ok, label) {
      await page.evaluate(([o, l]) => window.demo.check(o, l), [ok, label]);
      console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}`);
      if (!ok) throw new CheckFailed(label);
      await sleep(150);
    },

    async expectList(expected) {
      const want = JSON.stringify(expected);
      await t.waitFor(async () => JSON.stringify(await t.readList()) === want);
      const got = await t.readList();
      const ok = JSON.stringify(got) === want;
      await t.expect(ok, `App shows ${expected.join(', ')}${ok ? '' : ` (got ${got.join(', ') || 'nothing'})`}`);
    },

    async apiNames(user) {
      const res = await api('GET', '/items', user);
      return res.body.items.map((i) => i.name);
    },

    async expectApi(user, expected) {
      const got = await t.apiNames(user);
      const ok = JSON.stringify(got) === JSON.stringify(expected);
      await t.expect(ok, `API has ${expected.join(', ')} for ${user}${ok ? '' : ` (got ${got.join(', ') || 'nothing'})`}`);
    },

    async apiAdd(user, name, quantity) {
      const res = await api('POST', '/items', user, { name, quantity });
      if (res.status !== 201) throw new CheckFailed(`Could not add ${name} for ${user} (${res.status})`);
    },

    async apiDeleteAll(user) {
      const res = await api('GET', '/items', user);
      for (const item of res.body.items) await api('DELETE', `/items/${item.id}`, user);
    },

    stopBackend: control.stopBackend,
    startBackend: control.startBackend,

    async finish(ok, text) {
      await page.evaluate(([o, x]) => window.demo.finish(o, x), [ok, text]);
    },
  };
  return t;
}

async function main() {
  requireEmulator();
  if (!fs.existsSync(path.join(APP_DIR, 'main.dart.js'))) {
    throw new Error('mobile/build/web not found. Run "npm run build:mobile-web" first.');
  }
  const workDir = prepareWorkDir('mobile');

  log('Generating narration...');
  const clips = synthesizeNarration([...steps.map((s) => s.narration), steps.failureNarration], workDir);
  const failureClip = clips.pop();

  log(`Resetting emulator at ${EMULATOR} and starting backend...`);
  await resetEmulator();
  let backend = await startBackend();
  const control = {
    stopBackend: async () => {
      backend.kill();
      await sleep(800);
    },
    startBackend: async () => {
      backend = await startBackend();
    },
  };
  const server = await startStaticServer(HARNESS_PORT, { '/app/': APP_DIR, '/harness/': ROOT });

  let failed = null;
  const timeline = [];
  try {
    const browser = await chromium.launch();
    const context = await browser.newContext({ viewport: VIEWPORT, recordVideo: { dir: workDir, size: VIEWPORT } });
    const page = await context.newPage();
    const videoStart = Date.now();
    await page.goto(`http://127.0.0.1:${HARNESS_PORT}/harness/mobile.html?app=about:blank`);
    await sleep(600);

    const t = createDriver(page, control);
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
    server.close();
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
