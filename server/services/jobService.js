const fs = require('fs');
const path = require('path');

const JOBS_DIR = process.env.JOBS_DIR || path.resolve(process.cwd(), 'jobs');

let cachedJobs = [];

function init() {
  reload();
}

function getJobs() {
  return cachedJobs;
}

function getJobById(id) {
  const template = cachedJobs.find(j => j.id === id);
  if (!template) throw new Error(`Job not found: ${id}`);
  // Deep copy so runtime mutations don't affect the template
  return JSON.parse(JSON.stringify(template));
}

function reload() {
  const jobs = [];
  if (fs.existsSync(JOBS_DIR)) {
    for (const file of fs.readdirSync(JOBS_DIR)) {
      if (!file.endsWith('.json')) continue;
      try {
        const raw = fs.readFileSync(path.join(JOBS_DIR, file), 'utf8');
        const job = JSON.parse(raw);
        if (!job.id) job.id = file.replace('.json', '');
        jobs.push(job);
      } catch (e) {
        console.error(`Failed to load job ${file}:`, e.message);
      }
    }
  }
  cachedJobs = jobs;
  console.log(`Loaded ${jobs.length} job(s)`);
}

module.exports = { init, getJobs, getJobById, reload };
