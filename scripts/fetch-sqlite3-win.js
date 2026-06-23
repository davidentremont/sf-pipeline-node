#!/usr/bin/env node
/**
 * Downloads the Windows x64 prebuild of better-sqlite3 for cross-compilation.
 * Run this on macOS or Linux before running build-exe.js.
 *
 * Usage:
 *   node scripts/fetch-sqlite3-win.js
 */

const https  = require('https');
const fs     = require('fs');
const path   = require('path');
const zlib   = require('zlib');
const { execSync } = require('child_process');

const ROOT       = path.resolve(__dirname, '..');
const PKG        = require(path.join(ROOT, 'node_modules/better-sqlite3/package.json'));
const VERSION    = PKG.version;
const NAPI_VER   = 6;   // Node-API v6 is compatible with Node 18/20
const TARBALL    = `better-sqlite3-v${VERSION}-napi-v${NAPI_VER}-win32-x64.tar.gz`;
const URL        = `https://github.com/WiseLibs/better-sqlite3/releases/download/v${VERSION}/${TARBALL}`;
const OUT_DIR    = path.join(ROOT, 'node_modules/better-sqlite3/build/Release');
const TMP        = path.join(ROOT, `tmp-${TARBALL}`);

console.log(`Fetching ${URL}`);

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    function get(u) {
      https.get(u, res => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          file.close();
          get(res.headers.location);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode} for ${u}`));
          return;
        }
        res.pipe(file);
        file.on('finish', () => file.close(resolve));
      }).on('error', reject);
    }
    get(url);
  });
}

(async () => {
  try {
    await download(URL, TMP);
    console.log('Downloaded. Extracting…');

    if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

    // Extract just the .node file — tarball layout is build/Release/better_sqlite3.node
    execSync(`tar -xzf "${TMP}" --wildcards "*.node" --strip-components=2 -C "${OUT_DIR}"`, { shell: true });
    fs.unlinkSync(TMP);

    const nodeFile = path.join(OUT_DIR, 'better_sqlite3.node');
    if (!fs.existsSync(nodeFile)) {
      throw new Error('better_sqlite3.node not found after extraction — check tarball layout.');
    }
    console.log(`Done! ${nodeFile}`);
    console.log('\nYou can now run: node scripts/build-exe.js');
  } catch (e) {
    if (fs.existsSync(TMP)) fs.unlinkSync(TMP);
    console.error('Failed:', e.message);
    console.error(`\nFall back: download ${URL} manually,`);
    console.error(`extract better_sqlite3.node to ${OUT_DIR}/`);
    process.exit(1);
  }
})();
