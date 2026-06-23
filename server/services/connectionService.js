const { getDb } = require('./db');
const crypto = require('crypto');

function init() {
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS sf_connections (
      id            TEXT PRIMARY KEY,
      label         TEXT NOT NULL,
      instance_url  TEXT NOT NULL,
      access_token  TEXT,
      refresh_token TEXT,
      client_id     TEXT,
      client_secret TEXT,
      token_type    TEXT DEFAULT 'Bearer',
      issued_at     TEXT,
      created_at    TEXT NOT NULL,
      updated_at    TEXT NOT NULL
    )
  `);
}

function getAll() {
  const rows = getDb().prepare('SELECT * FROM sf_connections ORDER BY updated_at DESC').all();
  return rows.map(toSafe);
}

function get(id) {
  const r = getDb().prepare('SELECT * FROM sf_connections WHERE id = ?').get(id);
  return r ? toFull(r) : null;
}

function upsert(conn) {
  const db = getDb();
  const id = conn.id || crypto.randomUUID();
  const n = now();
  db.prepare(`
    INSERT INTO sf_connections
      (id, label, instance_url, access_token, refresh_token, client_id, client_secret, token_type, issued_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      label         = excluded.label,
      instance_url  = excluded.instance_url,
      access_token  = excluded.access_token,
      refresh_token = excluded.refresh_token,
      client_id     = excluded.client_id,
      client_secret = excluded.client_secret,
      token_type    = excluded.token_type,
      issued_at     = excluded.issued_at,
      updated_at    = excluded.updated_at
  `).run(
    id, conn.label, conn.instanceUrl,
    conn.accessToken || null, conn.refreshToken || null,
    conn.clientId || null, conn.clientSecret || null,
    conn.tokenType || 'Bearer', conn.issuedAt || null,
    conn.createdAt || n, n
  );
  return id;
}

function remove(id) {
  getDb().prepare('DELETE FROM sf_connections WHERE id = ?').run(id);
}

function toSafe(r) {
  return {
    id: r.id,
    label: r.label,
    instanceUrl: r.instance_url,
    hasToken: !!r.access_token,
    hasRefreshToken: !!r.refresh_token,
    hasOAuth: !!r.client_id,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function toFull(r) {
  return {
    id: r.id,
    label: r.label,
    instanceUrl: r.instance_url,
    accessToken: r.access_token,
    refreshToken: r.refresh_token,
    clientId: r.client_id,
    clientSecret: r.client_secret,
    tokenType: r.token_type,
    issuedAt: r.issued_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function now() { return new Date().toISOString(); }

module.exports = { init, getAll, get, upsert, remove };
