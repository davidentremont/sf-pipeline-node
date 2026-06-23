// Worker module — runs in a thread pool thread.
// Receives plain serializable data; returns plain serializable data.
// No access to ctx, salesforceService, or other main-thread state.
async function process({ records, workerId }) {
  const ids = records.map(r => r.Id);
  return {
    workerId,
    count: ids.length,
    preview: ids.slice(0, 5),
  };
}

module.exports = { process };
