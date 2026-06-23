#!/usr/bin/env node
/**
 * Packages sf-pipeline as a self-contained Windows executable.
 *
 * REQUIREMENTS
 * ─────────────────────────────────────────────────────────────────────────────
 * Preferred: run this script on Windows so `better-sqlite3` is already compiled
 * for the right platform after `npm install`.
 *
 * Cross-compile from macOS/Linux: download the Windows prebuild first —
 *   node scripts/fetch-sqlite3-win.js
 * then re-run this script.
 *
 * OUTPUT
 * ─────────────────────────────────────────────────────────────────────────────
 *   dist-exe/
 *     sf-pipeline.exe   (~100–130 MB, Node 20 bundled)
 *     README.txt        Deployment instructions
 */

const { execSync } = require('child_process');
const fs   = require('fs');
const path = require('path');

const ROOT    = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'dist-exe');

function run(cmd, cwd = ROOT) {
  console.log(`> ${cmd}`);
  execSync(cmd, { stdio: 'inherit', cwd, shell: true });
}

function abort(msg, hint) {
  console.error(`\nFATAL: ${msg}`);
  if (hint) console.error(`  ${hint}`);
  process.exit(1);
}

// ── Preflight checks ─────────────────────────────────────────────────────────

// Ensure devDependencies (pkg) are installed
if (!fs.existsSync(path.join(ROOT, 'node_modules/pkg'))) {
  console.log('Installing devDependencies…');
  run('npm install');
}

const sqliteNode = path.join(ROOT, 'node_modules/better-sqlite3/build/Release/better_sqlite3.node');
if (!fs.existsSync(sqliteNode)) {
  if (process.platform !== 'win32') {
    abort(
      'better-sqlite3 Windows native binary not found.',
      'Run `node scripts/fetch-sqlite3-win.js` to download the Windows prebuild, then retry.'
    );
  }
  abort(
    'better-sqlite3 native binary not found.',
    'Run `npm install` to build it, then retry.'
  );
}

// ── Step 1: build React client ───────────────────────────────────────────────

console.log('\n── 1/3  Build React client ──────────────────────────────────────────');
run('npm run build:client');

// ── Step 2: package with pkg ─────────────────────────────────────────────────

console.log('\n── 2/3  Package with pkg ────────────────────────────────────────────');
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

run('npx pkg . --compress GZip --output dist-exe/sf-pipeline.exe');

// ── Step 3: write deployment README ──────────────────────────────────────────

console.log('\n── 3/3  Write README ────────────────────────────────────────────────');
fs.writeFileSync(path.join(OUT_DIR, 'README.txt'),
`SF Async Data Pipeline
======================

Usage
─────
  sf-pipeline.exe

Then open http://localhost:8080 in a browser.

To use a different port:
  set PORT=9000 && sf-pipeline.exe        (cmd.exe)
  $env:PORT=9000; .\\sf-pipeline.exe      (PowerShell)

Directories  (relative to where the exe is run from)
─────────────────────────────────────────────────────
  data\\      SQLite database (created automatically).

Environment variables
─────────────────────
  PORT=8080                        HTTP / WebSocket port
  PROGRESS_DB=data\\pipeline.db     Path to SQLite database file

Salesforce OAuth setup
──────────────────────
In your Salesforce Connected App, add this Callback URL:
  http://localhost:8080/api/oauth/callback
(adjust the port if you changed PORT)
`);

const exePath = path.join(OUT_DIR, 'sf-pipeline.exe');
const sizeMB  = (fs.statSync(exePath).size / 1_048_576).toFixed(1);
console.log(`\nDone!  ${exePath}  (${sizeMB} MB)`);
