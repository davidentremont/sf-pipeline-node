const express = require('express');

function apiRouter(jobService, progressService, pluginRegistry, engine) {
  const router = express.Router();

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

  router.get('/plugins', (req, res) => {
    res.json(pluginRegistry.listPluginInfo());
  });

  router.get('/status', (req, res) => {
    res.json({ running: engine.isRunning() });
  });

  router.get('/progress', (req, res) => {
    res.json(progressService.getAll());
  });

  return router;
}

module.exports = apiRouter;
