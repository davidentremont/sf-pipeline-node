function wsHandler(wss, engine, jobService, progressService, connectionService) {
  const sessions = new Set();

  wss.on('connection', (ws) => {
    sessions.add(ws);

    send(ws, { type: 'CONNECTED', timestamp: Date.now(), running: engine.isRunning() });

    ws.on('message', (data) => {
      let msg;
      try { msg = JSON.parse(data); } catch { return; }

      switch (msg.type) {
        case 'START': handleStart(ws, msg); break;
        case 'STOP':  engine.stop(); break;
        default:
          send(ws, { type: 'ERROR', timestamp: Date.now(), message: `Unknown command: ${msg.type}` });
      }
    });

    ws.on('close', () => sessions.delete(ws));
    ws.on('error', () => sessions.delete(ws));
  });

  function handleStart(ws, msg) {
    if (engine.isRunning()) {
      send(ws, { type: 'ERROR', timestamp: Date.now(), message: 'Pipeline is already running' });
      return;
    }

    // Resolve credentials — prefer connectionId lookup, fall back to inline fields
    let instanceUrl = (msg.instanceUrl || '').trim();
    let accessToken = (msg.accessToken || '').trim();

    if (msg.connectionId) {
      const conn = connectionService.get(msg.connectionId);
      if (!conn) {
        send(ws, { type: 'ERROR', timestamp: Date.now(), message: 'Connection not found — it may have been deleted' });
        return;
      }
      instanceUrl = conn.instanceUrl;
      accessToken = conn.accessToken;
    }

    if (!instanceUrl) {
      send(ws, { type: 'ERROR', timestamp: Date.now(), message: 'Instance URL is required' });
      return;
    }
    if (!accessToken) {
      send(ws, { type: 'ERROR', timestamp: Date.now(), message: 'Access token is required' });
      return;
    }

    const jobId = msg.jobId;
    const batchSize = msg.batchSize || 1000;
    const threads = msg.threads || 5;
    const fresh = !!msg.fresh;

    let job;
    try {
      job = jobService.getJobById(jobId);
    } catch (e) {
      send(ws, { type: 'ERROR', timestamp: Date.now(), message: `Job not found: ${jobId}` });
      return;
    }

    // Merge runtime params into job pluginConfig and resolve query tokens
    const queryTokens = {};
    if (msg.params && typeof msg.params === 'object') {
      job.pluginConfig = job.pluginConfig || {};
      for (const [pluginName, pluginParams] of Object.entries(msg.params)) {
        job.pluginConfig[pluginName] = job.pluginConfig[pluginName] || {};
        for (const [k, v] of Object.entries(pluginParams)) {
          job.pluginConfig[pluginName][k] = v;
          queryTokens[k] = v;
        }
      }
    }
    for (const [k, v] of Object.entries(queryTokens)) {
      job.query = job.query.replace(new RegExp(`\\{${k}\\}`, 'g'), v);
    }

    const resolvedQuery = job.query;

    // Resume logic
    let resumeFromId = null;
    let initialProcessed = 0;
    const existing = progressService.get(jobId, instanceUrl);

    if (!fresh && existing) {
      if (resolvedQuery === existing.query && existing.last_id && existing.status !== 'completed') {
        resumeFromId = existing.last_id;
        initialProcessed = existing.total_processed;
      }
    }

    progressService.upsert({
      jobId,
      instanceUrl,
      query: resolvedQuery,
      lastId: resumeFromId,
      totalProcessed: initialProcessed,
      batchNum: (existing && resumeFromId) ? existing.batch_num : 0,
      totalCount: existing?.total_count || 0,
      status: 'running',
      startedAt: (existing && resumeFromId) ? existing.started_at : new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      finishedAt: null,
    });

    const config = { job, instanceUrl, accessToken, batchSize, threads, resumeFromId, initialProcessed };
    engine.start(config, (event) => broadcast(event));
  }

  function broadcast(event) {
    if (!sessions.size) return;
    const msg = JSON.stringify(event);
    for (const ws of sessions) {
      if (ws.readyState === ws.OPEN) {
        try { ws.send(msg); } catch {}
      }
    }
  }

  function send(ws, event) {
    try { ws.send(JSON.stringify(event)); } catch {}
  }
}

module.exports = wsHandler;
