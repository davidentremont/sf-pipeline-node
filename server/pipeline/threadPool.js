const { Worker } = require('worker_threads');
const path = require('path');
const os = require('os');

const RUNNER = path.join(__dirname, 'workerRunner.js');

class ThreadPool {
  constructor(size) {
    this._size = size || os.cpus().length;
    this._workers = [];
    this._idle = [];
    this._queue = [];
    this._pending = new Map();
    this._taskId = 0;

    for (let i = 0; i < this._size; i++) {
      this._spawnWorker();
    }
  }

  get size() { return this._size; }

  // Run a task in the pool. scriptPath must be an absolute path to a module
  // exporting `async function process(data) { ... }`. data must be
  // structured-clone serializable (plain objects/arrays/primitives).
  run(scriptPath, data) {
    return new Promise((resolve, reject) => {
      this._queue.push({ scriptPath, data, resolve, reject });
      this._tryDispatch();
    });
  }

  terminate() {
    for (const w of this._workers) w.terminate();
    this._workers = [];
    this._idle = [];
  }

  _spawnWorker() {
    const worker = new Worker(RUNNER);

    worker.on('message', ({ id, ok, result, error }) => {
      const task = this._pending.get(id);
      if (!task) return;
      this._pending.delete(id);
      this._idle.push(worker);
      if (ok) task.resolve(result);
      else task.reject(new Error(error));
      this._tryDispatch();
    });

    worker.on('error', (err) => {
      console.error('[ThreadPool] worker error:', err.message);
      this._removeWorker(worker);
      this._spawnWorker();
    });

    worker.on('exit', (code) => {
      if (code !== 0) {
        this._removeWorker(worker);
        this._spawnWorker();
      }
    });

    this._workers.push(worker);
    this._idle.push(worker);
  }

  _removeWorker(worker) {
    this._workers = this._workers.filter(w => w !== worker);
    this._idle = this._idle.filter(w => w !== worker);
  }

  _tryDispatch() {
    while (this._idle.length && this._queue.length) {
      const worker = this._idle.pop();
      const { scriptPath, data, resolve, reject } = this._queue.shift();
      const id = this._taskId++;
      this._pending.set(id, { resolve, reject });
      worker.postMessage({ id, scriptPath, data });
    }
  }
}

module.exports = ThreadPool;
