const express = require('express');
const crypto = require('crypto');

// In-memory store for in-progress OAuth flows (keyed by random state token)
const oauthStates = new Map();

function apiRouter(jobService, progressService, pluginRegistry, engine, connectionService) {
  const router = express.Router();

  // ── Jobs ──────────────────────────────────────────────────────────────────

  router.get('/jobs', (req, res) => {
    res.json(jobService.getJobs());
  });

  router.get('/jobs/:id', (req, res) => {
    try {
      res.json(jobService.getJobById(req.params.id));
    } catch (e) {
      res.status(404).json({ error: e.message });
    }
  });

  router.post('/jobs/reload', (req, res) => {
    jobService.reload();
    res.json({ message: 'Jobs reloaded', count: jobService.getJobs().length });
  });

  // ── Plugins / status / progress ───────────────────────────────────────────

  router.get('/plugins', (req, res) => {
    res.json(pluginRegistry.listPluginInfo());
  });

  router.get('/status', (req, res) => {
    res.json({ running: engine.isRunning() });
  });

  router.get('/progress', (req, res) => {
    res.json(progressService.getAll());
  });

  // ── Connections ───────────────────────────────────────────────────────────

  router.get('/connections', (req, res) => {
    res.json(connectionService.getAll());
  });

  router.post('/connections', (req, res) => {
    const { label, instanceUrl, accessToken, clientId, clientSecret } = req.body;
    if (!label || !instanceUrl) return res.status(400).json({ error: 'label and instanceUrl are required' });
    if (!accessToken) return res.status(400).json({ error: 'accessToken is required' });
    const id = connectionService.upsert({ label, instanceUrl, accessToken, clientId, clientSecret });
    res.json({ id });
  });

  router.delete('/connections/:id', (req, res) => {
    connectionService.remove(req.params.id);
    res.json({ ok: true });
  });

  // ── OAuth 2.0 Web Server Flow ─────────────────────────────────────────────

  router.get('/oauth/start', (req, res) => {
    const { instanceUrl, clientId, clientSecret, label } = req.query;
    if (!instanceUrl || !clientId) {
      return res.status(400).send('instanceUrl and clientId are required');
    }

    // Prune stale states (> 5 minutes old)
    const cutoff = Date.now() - 5 * 60 * 1000;
    for (const [k, v] of oauthStates) if (v.ts < cutoff) oauthStates.delete(k);

    const state = crypto.randomUUID();
    oauthStates.set(state, {
      instanceUrl: instanceUrl.trim(),
      clientId: clientId.trim(),
      clientSecret: (clientSecret || '').trim(),
      label: (label || instanceUrl).trim(),
      ts: Date.now(),
    });

    const callbackUrl = `${req.protocol}://${req.get('host')}/api/oauth/callback`;
    const authUrl = new URL(`${instanceUrl.trim()}/services/oauth2/authorize`);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('client_id', clientId.trim());
    authUrl.searchParams.set('redirect_uri', callbackUrl);
    authUrl.searchParams.set('state', state);

    res.redirect(authUrl.toString());
  });

  router.get('/oauth/callback', async (req, res) => {
    const { code, state, error: sfError } = req.query;

    if (sfError) {
      return res.send(callbackPage(null, `Salesforce declined: ${sfError}`));
    }

    const st = oauthStates.get(state);
    if (!st) return res.send(callbackPage(null, 'OAuth state expired or not found — please try again'));
    oauthStates.delete(state);

    const callbackUrl = `${req.protocol}://${req.get('host')}/api/oauth/callback`;

    try {
      const tokenRes = await fetch(`${st.instanceUrl}/services/oauth2/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          client_id: st.clientId,
          client_secret: st.clientSecret,
          redirect_uri: callbackUrl,
        }).toString(),
      });

      if (!tokenRes.ok) {
        const body = await tokenRes.text();
        return res.send(callbackPage(null, `Token exchange failed: ${body}`));
      }

      const tokens = await tokenRes.json();
      const connId = connectionService.upsert({
        label: st.label,
        instanceUrl: tokens.instance_url || st.instanceUrl,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token || null,
        clientId: st.clientId,
        clientSecret: st.clientSecret || null,
        tokenType: tokens.token_type || 'Bearer',
        issuedAt: tokens.issued_at ? new Date(Number(tokens.issued_at)).toISOString() : new Date().toISOString(),
      });

      res.send(callbackPage(connId, null));
    } catch (e) {
      res.send(callbackPage(null, e.message));
    }
  });

  return router;
}

function callbackPage(connId, error) {
  const payload = JSON.stringify(
    error
      ? { type: 'SF_OAUTH_ERROR', error }
      : { type: 'SF_OAUTH_SUCCESS', connectionId: connId }
  );
  const message = error
    ? `Authentication failed: ${error}`
    : 'Authentication successful! This window will close automatically.';
  return `<!DOCTYPE html><html><head><title>Salesforce Auth</title>
<style>body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#f3f4f6}
.box{text-align:center;padding:2rem;background:white;border-radius:.5rem;box-shadow:0 1px 4px rgba(0,0,0,.1);max-width:24rem}
p{color:${error ? '#dc2626' : '#16a34a'}}</style></head><body>
<div class="box"><p>${message}</p></div>
<script>
  (function(){
    var p = ${payload};
    try { if (window.opener) window.opener.postMessage(p, '*'); } catch(e) {}
    setTimeout(function(){ window.close(); }, 1200);
  })();
</script></body></html>`;
}

module.exports = apiRouter;
