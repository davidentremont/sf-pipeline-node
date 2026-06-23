function buildQuery(baseQuery, lastId, batchSize) {
  let q = baseQuery.replace(/\s+LIMIT\s+\d+/gi, '').trim();

  if (lastId) {
    const pkClause = `Id > '${lastId}'`;
    const hasWhere = /\bWHERE\b/i.test(q);
    const orderByPos = q.toUpperCase().indexOf(' ORDER BY ');
    if (orderByPos >= 0) {
      q = q.slice(0, orderByPos)
        + (hasWhere ? ' AND ' : ' WHERE ') + pkClause
        + q.slice(orderByPos);
    } else {
      q = q + (hasWhere ? ' AND ' : ' WHERE ') + pkClause;
    }
  }

  return `${q} LIMIT ${batchSize}`;
}

module.exports = { buildQuery };
