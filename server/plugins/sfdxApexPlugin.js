const { API_VERSION } = require('../services/salesforceService');

const plugin = {
  getName: () => 'SfdxApexPlugin',
  getVersion: () => '1.0',
  getDescription: () => 'Runs anonymous Apex via the Salesforce Tooling API REST endpoint',

  async execute(input, ctx) {
    const ids = input.map(r => `'${r.Id}'`).join(',');
    const apex = `List<Id> recordIds = new List<Id>{${ids}};\nSystem.debug('Worker ${ctx.workerId} processing ' + recordIds.size() + ' records');`;

    const url = `${ctx.instanceUrl}/services/data/${API_VERSION}/tooling/executeAnonymous?anonymousBody=${encodeURIComponent(apex)}`;
    const res = await fetch(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${ctx.accessToken}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(30000),
    });

    const body = await res.json();
    if (!res.ok) throw new Error(`Tooling API returned HTTP ${res.status}: ${JSON.stringify(body)}`);
    if (!body.success) {
      const problem = body.compileProblem || body.exceptionMessage || 'unknown error';
      throw new Error(`Apex execution failed: ${problem}`);
    }

    ctx.log(`Apex executed for ${input.length} records`);
    return input;
  },
};

module.exports = plugin;
