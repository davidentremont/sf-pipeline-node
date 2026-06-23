const { API_VERSION } = require('../services/salesforceService');

const DEFAULT_BATCH_SIZE = 50;

const plugin = {
  getName: () => 'ShareCalculatorPlugin',
  getVersion: () => '1.0',
  getDescription: () => 'Recalculates Salesforce sharing via sobjectshares Apex REST endpoint and inserts resulting share records',

  async execute(input, ctx) {
    if (!input.length) return input;

    const config = ctx.job.pluginConfig?.ShareCalculatorPlugin || {};
    const objectType = config.objectType || 'Case';
    const batchSize = parseInt(config.batchSize, 10) || DEFAULT_BATCH_SIZE;

    ctx.log(`ShareCalculatorPlugin: objectType=${objectType}, batchSize=${batchSize}`);

    const ids = input.map(r => r.Id).filter(Boolean);
    if (!ids.length) return input;

    let totalInserted = 0;
    for (let i = 0; i < ids.length; i += batchSize) {
      totalInserted += await processBatch(ids.slice(i, i + batchSize), objectType, ctx);
    }

    ctx.log(`ShareCalculatorPlugin: inserted ${totalInserted} share record(s) for ${ids.length} record(s)`);
    return input;
  },
};

async function processBatch(ids, objectType, ctx) {
  const url = `${ctx.instanceUrl}/services/apexrest/sobjectshares?objectApiName=${objectType}&recordIds=${ids.join(',')}`;
  const res = await fetch(url, {
    method: 'GET',
    headers: { Authorization: `Bearer ${ctx.accessToken}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(20000),
  });

  if (!res.ok) {
    ctx.log(`Warning: sobjectshares returned HTTP ${res.status}: ${await res.text()}`);
    return 0;
  }

  const body = await res.json();
  const shareRecords = body.records || [];
  if (!shareRecords.length) return 0;

  let inserted = 0;
  for (let i = 0; i < shareRecords.length; i += 200) {
    inserted += await insertBatch(shareRecords.slice(i, i + 200), ctx);
  }
  return inserted;
}

async function insertBatch(records, ctx) {
  const url = `${ctx.instanceUrl}/services/data/${API_VERSION}/composite/sobjects?allOrNone=false`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${ctx.accessToken}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ records }),
    signal: AbortSignal.timeout(20000),
  });

  if (!res.ok) {
    ctx.log(`Warning: composite insert returned HTTP ${res.status}: ${await res.text()}`);
    return 0;
  }
  return records.length;
}

module.exports = plugin;
