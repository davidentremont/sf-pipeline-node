const { buildQuery } = require('./queryEngine');

class PipelineEngine {
  constructor(salesforceService, progressService, pluginRegistry, threadPool) {
    this.sf = salesforceService;
    this.progress = progressService;
    this.plugins = pluginRegistry;
    this.threadPool = threadPool;
    this._running = false;
    this._stopRequested = false;
    this._totalProcessed = 0;
  }

  isRunning() { return this._running; }

  async start(config, onEvent) {
    if (this._running) {
      onEvent({ type: 'ERROR', timestamp: Date.now(), message: 'Pipeline is already running' });
      return;
    }
    this._running = true;
    this._stopRequested = false;
    this._totalProcessed = config.initialProcessed || 0;

    // Fire-and-forget — don't await in caller
    this._runPipeline(config, onEvent).finally(() => {
      this._running = false;
    });
  }

  stop() {
    this._stopRequested = true;
    this._emit({ type: 'STOPPING', timestamp: Date.now() });
  }

  async _runPipeline(config, onEvent) {
    this._emit = onEvent;
    const { job, instanceUrl, accessToken, batchSize, threads, resumeFromId } = config;
    const jobId = job.id;

    const pluginList = this.plugins.getPlugins(job.plugins);

    onEvent({
      type: 'STARTED', timestamp: Date.now(),
      job: job.name, instanceUrl, batchSize, threads,
      plugins: job.plugins,
      resumeFromId: resumeFromId || null,
      initialProcessed: this._totalProcessed,
    });

    // Fetch total count (non-fatal)
    const objectType = extractObjectType(job.query);
    if (objectType) {
      try {
        const totalCount = await this._fetchTotalCount(job.query, objectType, instanceUrl, accessToken);
        if (totalCount > 0) {
          onEvent({ type: 'TOTAL_COUNT', timestamp: Date.now(), objectType, totalCount });
          this.progress.setTotalCount(jobId, instanceUrl, totalCount);
        }
      } catch {}
    }

    let lastId = resumeFromId || null;
    let batchNum = 0;
    let completedNormally = false;
    let errorOccurred = false;
    const allWorkerPromises = [];
    let workerIdSeq = 0;

    try {
      while (!this._stopRequested) {
        batchNum++;
        const query = buildQuery(job.query, lastId, batchSize);
        onEvent({ type: 'QUERYING', timestamp: Date.now(), batch: batchNum, query });

        let records;
        try {
          records = await this.sf.runQuery(query, instanceUrl, accessToken);
        } catch (e) {
          onEvent({ type: 'ERROR', timestamp: Date.now(), message: `Query failed: ${e.message}` });
          errorOccurred = true;
          break;
        }

        if (records.length === 0) {
          completedNormally = true;
          break;
        }

        lastId = records[records.length - 1].Id;

        onEvent({
          type: 'QUERY_COMPLETE', timestamp: Date.now(),
          batch: batchNum, count: records.length,
          firstId: records[0].Id, lastId,
        });

        const chunks = chunkList(records, threads);
        const workerInit = chunks.map((chunk, i) => ({
          id: ++workerIdSeq, status: 'waiting', records: chunk.length,
        }));
        // Back-fill sequential ids
        const chunkWorkerIds = workerInit.map(w => w.id);
        onEvent({ type: 'WORKERS_INIT', timestamp: Date.now(), workers: workerInit });

        // Dispatch workers fire-and-forget; continue querying next batch immediately.
        for (let i = 0; i < chunks.length; i++) {
          const workerId = chunkWorkerIds[i];
          const chunk = chunks[i];
          const p = this._runWorker(workerId, chunk, pluginList, config, onEvent)
            .then(() => { this._totalProcessed += chunk.length; });
          allWorkerPromises.push(p);
        }

        onEvent({
          type: 'BATCH_COMPLETE', timestamp: Date.now(),
          batch: batchNum, totalProcessed: this._totalProcessed,
        });

        this.progress.updateBatch(jobId, instanceUrl, lastId, this._totalProcessed, batchNum);
      }

      // Wait for all in-flight workers
      await Promise.allSettled(allWorkerPromises);

      if (completedNormally) {
        onEvent({
          type: 'COMPLETE', timestamp: Date.now(),
          totalProcessed: this._totalProcessed,
          message: 'All records processed',
        });
      }
    } finally {
      const finalStatus = completedNormally ? 'completed' : (errorOccurred ? 'error' : 'stopped');
      this.progress.setStatus(jobId, instanceUrl, finalStatus, this._totalProcessed);
      this._running = false;
      onEvent({ type: 'STOPPED', timestamp: Date.now(), totalProcessed: this._totalProcessed });
    }
  }

  async _runWorker(workerId, records, pluginList, config, onEvent) {
    onEvent({ type: 'WORKER_START', timestamp: Date.now(), workerId, count: records.length });

    let data = records;
    for (const plugin of pluginList) {
      if (this._stopRequested) break;

      onEvent({ type: 'WORKER_PLUGIN', timestamp: Date.now(), workerId, plugin: plugin.getName() });

      const ctx = {
        workerId,
        instanceUrl: config.instanceUrl,
        accessToken: config.accessToken,
        job: config.job,
        salesforceService: this.sf,
        threadPool: this.threadPool,
        log: (msg) => onEvent({ type: 'WORKER_LOG', timestamp: Date.now(), workerId, message: msg }),
      };

      try {
        data = await plugin.execute(data, ctx);
      } catch (e) {
        onEvent({
          type: 'WORKER_ERROR', timestamp: Date.now(),
          workerId, plugin: plugin.getName(), error: e.message,
        });
        break;
      }
    }

    onEvent({ type: 'WORKER_DONE', timestamp: Date.now(), workerId, count: records.length });
  }

  async _fetchTotalCount(queryTemplate, objectType, instanceUrl, accessToken) {
    const whereClause = extractWhereClause(queryTemplate);
    if (!whereClause) {
      return this.sf.getRecordCount(objectType, instanceUrl, accessToken);
    }
    try {
      const countSoql = `SELECT COUNT() FROM ${objectType} WHERE ${whereClause}`;
      return await this.sf.runCountQuery(countSoql, instanceUrl, accessToken);
    } catch {
      return this.sf.getRecordCount(objectType, instanceUrl, accessToken);
    }
  }
}

function extractObjectType(query) {
  if (!query) return null;
  const m = query.match(/\bFROM\s+(\w+)/i);
  return m ? m[1] : null;
}

function extractWhereClause(query) {
  if (!query) return null;
  const m = query.match(/\bWHERE\b(.+?)(?:\bORDER\b|\bLIMIT\b|\bGROUP\b|\bHAVING\b|$)/is);
  return m ? m[1].trim() : null;
}

function chunkList(list, numChunks) {
  const chunks = [];
  const chunkSize = Math.ceil(list.length / numChunks);
  for (let i = 0; i < list.length; i += chunkSize) {
    chunks.push(list.slice(i, i + chunkSize));
  }
  return chunks;
}

module.exports = PipelineEngine;
