const statementQuery = `
  SELECT userid::text AS "userId",
         dbid::text AS "databaseId",
         queryid::text AS "queryId",
         query,
         calls::text AS calls
  FROM pg_stat_statements
  WHERE dbid = (SELECT oid FROM pg_database WHERE datname = current_database())
`;

export async function readPostgresStatementSnapshot(client) {
  const rows = await client.$queryRawUnsafe(statementQuery);
  return rows.map((row) => ({
    key: [row.userId, row.databaseId, row.queryId].join(':'),
    query: row.query,
    calls: Number(row.calls),
  }));
}

export function summarizePostgresStatementDelta(before, after) {
  const priorCalls = new Map(before.map((row) => [row.key, row.calls]));
  const statements = after
    .filter((row) => !/\bpg_stat_statements\b/iu.test(row.query))
    .map((row) => ({
      queryId: row.key,
      kind: statementKind(row.query),
      calls: row.calls - (priorCalls.get(row.key) ?? 0),
      query: row.query.replace(/\s+/gu, ' ').trim(),
    }))
    .filter((row) => row.calls > 0)
    .sort((left, right) => right.calls - left.calls);

  return {
    readCalls: totalCalls(statements, 'read'),
    writeCalls: totalCalls(statements, 'write'),
    otherCalls: totalCalls(statements, 'other'),
    statements,
  };
}

function statementKind(query) {
  const sql = query.trimStart();
  if (/^(SELECT|SHOW|VALUES)\b/iu.test(sql)) return 'read';
  if (/^(INSERT|UPDATE|DELETE|MERGE)\b/iu.test(sql)) return 'write';
  return 'other';
}

function totalCalls(statements, kind) {
  return statements.reduce(
    (total, statement) =>
      total + (statement.kind === kind ? statement.calls : 0),
    0,
  );
}
