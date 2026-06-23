const path = require('path');

const WORKER = path.join(__dirname, 'logPlugin.worker.js');

const plugin = {
  getName: () => 'LogPlugin',
  getVersion: () => '1.0',
  getDescription: () => 'Logs record IDs — demonstrates threadPool.run() dispatch',

  async execute(input, ctx) {
    // Dispatch CPU work to the shared thread pool.
    // Pass only serializable data (no functions, no class instances).
    const result = await ctx.threadPool.run(WORKER, {
      records: input.map(r => ({ Id: r.Id })),
      workerId: ctx.workerId,
    });
    ctx.log(`LogPlugin: worker ${result.workerId} processed ${result.count} records, first ids: [${result.preview.join(', ')}]`);
    return input;
  },
};

module.exports = plugin;
