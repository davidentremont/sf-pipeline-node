const API_VERSION = 'v64.0';

async function runQuery(soql, instanceUrl, accessToken) {
  const url = `${instanceUrl}/services/data/${API_VERSION}/query?q=${encodeURIComponent(soql)}`;
  const records = [];
  let nextUrl = url;

  while (nextUrl) {
    const res = await sfFetch(nextUrl, 'GET', accessToken, { connectTimeout: 30000, readTimeout: 60000 });
    const body = await res.json();
    if (!res.ok) throw new Error(`Salesforce query failed (HTTP ${res.status}): ${JSON.stringify(body)}`);

    for (const record of (body.records || [])) {
      const row = {};
      for (const [k, v] of Object.entries(record)) {
        if (k !== 'attributes') row[k] = v;
      }
      records.push(row);
    }

    nextUrl = (!body.done && body.nextRecordsUrl)
      ? `${instanceUrl}${body.nextRecordsUrl}`
      : null;
  }
  return records;
}

async function runCountQuery(soql, instanceUrl, accessToken) {
  const url = `${instanceUrl}/services/data/${API_VERSION}/query?q=${encodeURIComponent(soql)}`;
  const res = await sfFetch(url, 'GET', accessToken, { connectTimeout: 10000, readTimeout: 15000 });
  const body = await res.json();
  if (!res.ok) throw new Error(`Count query failed (HTTP ${res.status}): ${JSON.stringify(body)}`);
  return body.totalSize || 0;
}

async function getRecordCount(objectType, instanceUrl, accessToken) {
  const url = `${instanceUrl}/services/data/${API_VERSION}/limits/recordCount?sObjects=${encodeURIComponent(objectType)}`;
  const res = await sfFetch(url, 'GET', accessToken, { connectTimeout: 10000, readTimeout: 10000 });
  const body = await res.json();
  if (!res.ok) throw new Error(`recordCount failed (HTTP ${res.status}): ${JSON.stringify(body)}`);
  return body.sObjects?.[0]?.count || 0;
}

async function sfFetch(url, method, accessToken, opts = {}) {
  const controller = new AbortController();
  const timeout = opts.readTimeout || 60000;
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    return await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { runQuery, runCountQuery, getRecordCount, sfFetch, API_VERSION };
