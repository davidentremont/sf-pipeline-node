const { parentPort } = require('worker_threads');

parentPort.on('message', async ({ id, scriptPath, data }) => {
  try {
    const mod = require(scriptPath);
    if (typeof mod.process !== 'function') {
      throw new Error(`Worker module must export a process() function: ${scriptPath}`);
    }
    const result = await mod.process(data);
    parentPort.postMessage({ id, ok: true, result });
  } catch (e) {
    parentPort.postMessage({ id, ok: false, error: e.message });
  }
});
