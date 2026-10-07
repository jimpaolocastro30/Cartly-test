#!/usr/bin/env node
/** Builds the Flutter web app that record-mobile.js serves at /app/. */
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const { API } = require('./lib/common');

const flutter = process.env.FLUTTER_BIN || 'flutter';
execFileSync(
  flutter,
  [
    'build', 'web', '--release', '--no-wasm-dry-run',
    '--base-href', '/app/',
    `--dart-define=API_BASE_URL=${API}`,
    '--dart-define=USER_ID=alice',
  ],
  { cwd: path.resolve(__dirname, '../mobile'), stdio: 'inherit', shell: process.platform === 'win32' },
);
