const { API_VERSION } = require('../services/salesforceService');

const MAX_IDS_PER_REQUEST = 200;

const plugin = {
  getName: () => 'CompositeDeletePlugin',
  getVersion: () => '1.0',
  getDescription: () => 'Deletes records via the Salesforce Composite API (DELETE /composite/sobjects)',

  async execute(input, ctx) {
    if (!input.length) return input;

    const allOrNone = getConfig(ctx.job, 'CompositeDeletePlugin', 'allOrNone') === 'true';
    const ids = input.map(r => r.Id).filter(Boolean);
    if (!ids.length) return input;

    let totalDeleted = 0;
    let totalFailed = 0;

    for (let i = 0; i < ids.length; i += MAX_IDS_PER_REQUEST) {
      const batch = ids.slice(i, i + MAX_IDS_PER_REQUEST);
      const [deleted, failed] = await deleteBatch(batch, allOrNone, ctx);
      totalDeleted += deleted;
      totalFailed += failed;
    }

    ctx.log(`CompositeDeletePlugin: deleted=${totalDeleted}, failed=${totalFailed} (of ${ids.length} records)`);
    return input;
  },
};

async function deleteBatch(ids, allOrNone, ctx) {
  const url = `${ctx.instanceUrl}/services/data/${API_VERSION}/composite/sobjects?ids=${ids.join(',')}&allOrNone=${allOrNone}`;
  const res = await fetch(url, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${ctx.accessToken}`, Accept: 'application/json' },
  });

  if (!res.ok) {
    const err = await res.text();
    ctx.log(`Warning: composite delete returned HTTP ${res.status}: ${err}`);
    return [0, ids.length];
  }

  const results = await res.json();
  if (!Array.isArray(results)) return [0, 0];

  let deleted = 0;
  let failed = 0;
  const errors = [];

  for (const r of results) {
    if (r.success) {
      deleted++;
    } else {
      failed++;
      if (r.errors?.length) errors.push(`${r.id || '?'}: ${r.errors[0].message}`);
    }
  }

  if (errors.length) {
    ctx.log(`Delete errors: ${errors.slice(0, 5).join('; ')}${errors.length > 5 ? ` (+${errors.length - 5} more)` : ''}`);
  }

  return [deleted, failed];
}

function getConfig(job, pluginName, key) {
  return job.pluginConfig?.[pluginName]?.[key];
}

module.exports = plugin;
