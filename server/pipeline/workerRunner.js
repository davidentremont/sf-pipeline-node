const { parentPort } = require('worker_threads');
const path   = require('path');
const os     = require('os');
const fs     = require('fs');
const crypto = require('crypto');

// Under pkg, plugin .worker.js files live in the snapshot filesystem.
// Worker threads can't require() snapshot paths directly — extract to temp.
function resolveScript(scriptPath) {
  if (!process.pkg) return scriptPath;
  const hash = crypto.createHash('md5').update(scriptPath).digest('hex').slice(0, 8);
  const tmp  = path.join(os.tmpdir(), `sf-wkr-${hash}.js`);
  if (!fs.existsSync(tmp)) {
    fs.writeFileSync(tmp, fs.readFileSync(scriptPath, 'utf8'));
  }
  return tmp;
}

parentPort.on('message', async ({ id, scriptPath, data }) => {
  try {
    const resolved = resolveScript(scriptPath);
    const mod = require(resolved);
    if (typeof mod.process !== 'function') {
      throw new Error(`Worker module must export a process() function: ${scriptPath}`);
    }
    const result = await mod.process(data);
    parentPort.postMessage({ id, ok: true, result });
  } catch (e) {
    parentPort.postMessage({ id, ok: false, error: e.message });
  }
});
