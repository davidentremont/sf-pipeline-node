const http = require('http');
const path = require('path');
const express = require('express');
const { WebSocketServer } = require('ws');

const jobService = require('./services/jobService');
const progressService = require('./services/progressService');
const connectionService = require('./services/connectionService');
const salesforceService = require('./services/salesforceService');
const pluginRegistry = require('./plugins/registry');
const PipelineEngine = require('./pipeline/engine');
const ThreadPool = require('./pipeline/threadPool');
const apiRouter = require('./routes/api');
const wsHandler = require('./ws/handler');

const PORT = process.env.PORT || 8080;
const CLIENT_DIST = path.resolve(__dirname, '../client/dist');

progressService.init();
connectionService.init();
jobService.init();

const threadPool = new ThreadPool();
const engine = new PipelineEngine(salesforceService, progressService, pluginRegistry, threadPool);

const app = express();
app.use(express.json());

app.use('/api', apiRouter(jobService, progressService, pluginRegistry, engine, connectionService));

// Serve React client if built
app.use(express.static(CLIENT_DIST));
app.get('*', (req, res) => {
  res.sendFile(path.join(CLIENT_DIST, 'index.html'));
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });
wsHandler(wss, engine, jobService, progressService, connectionService);

server.listen(PORT, () => {
  console.log(`sf-pipeline running on http://localhost:${PORT} (thread pool: ${threadPool.size} threads)`);
});

function shutdown() {
  threadPool.terminate();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
