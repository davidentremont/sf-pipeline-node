const { getDb } = require('./db');

let db;

function init() {
  db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS pipeline_progress (
      job_id          TEXT    NOT NULL,
      instance_url    TEXT    NOT NULL,
      query           TEXT,
      last_id         TEXT,
      total_processed INTEGER DEFAULT 0,
      batch_num       INTEGER DEFAULT 0,
      status          TEXT    DEFAULT 'running',
      started_at      TEXT,
      updated_at      TEXT,
      PRIMARY KEY (job_id, instance_url)
    )
  `);
  // Migrations
  for (const col of ['total_count INTEGER DEFAULT 0', 'finished_at TEXT']) {
    try { db.exec(`ALTER TABLE pipeline_progress ADD COLUMN ${col}`); } catch {}
  }
}

function get(jobId, instanceUrl) {
  return db.prepare('SELECT * FROM pipeline_progress WHERE job_id = ? AND instance_url = ?')
    .get(jobId, instanceUrl) || null;
}

function upsert(p) {
  db.prepare(`
    INSERT INTO pipeline_progress
      (job_id, instance_url, query, last_id, total_processed, batch_num, total_count, status, started_at, updated_at, finished_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(job_id, instance_url) DO UPDATE SET
      query           = excluded.query,
      last_id         = excluded.last_id,
      total_processed = excluded.total_processed,
      batch_num       = excluded.batch_num,
      total_count     = excluded.total_count,
      status          = excluded.status,
      started_at      = excluded.started_at,
      updated_at      = excluded.updated_at,
      finished_at     = excluded.finished_at
  `).run(
    p.jobId, p.instanceUrl, p.query, p.lastId,
    p.totalProcessed, p.batchNum, p.totalCount || 0,
    p.status, p.startedAt, p.updatedAt, p.finishedAt || null
  );
}

function updateBatch(jobId, instanceUrl, lastId, totalProcessed, batchNum) {
  db.prepare(`
    UPDATE pipeline_progress
    SET last_id = ?, total_processed = ?, batch_num = ?, updated_at = ?
    WHERE job_id = ? AND instance_url = ?
  `).run(lastId, totalProcessed, batchNum, now(), jobId, instanceUrl);
}

function setTotalCount(jobId, instanceUrl, totalCount) {
  db.prepare(`
    UPDATE pipeline_progress SET total_count = ?, updated_at = ? WHERE job_id = ? AND instance_url = ?
  `).run(totalCount, now(), jobId, instanceUrl);
}

function setStatus(jobId, instanceUrl, status, totalProcessed) {
  db.prepare(`
    UPDATE pipeline_progress
    SET status = ?, total_processed = ?, updated_at = ?, finished_at = ?
    WHERE job_id = ? AND instance_url = ?
  `).run(status, totalProcessed, now(), now(), jobId, instanceUrl);
}

function getAll() {
  return db.prepare('SELECT * FROM pipeline_progress ORDER BY updated_at DESC').all();
}

function now() {
  return new Date().toISOString();
}

module.exports = { init, get, upsert, updateBatch, setTotalCount, setStatus, getAll };
