// Read-only audit of date/time values currently stored in the DB. Does NOT
// modify anything. Use this before deciding whether a data-correction
// migration is needed.
//
// Run: node scripts/auditTimezones.js [--tz=Australia/Sydney]
//
// Reports, per column:
//   • row count and null/non-null split
//   • min / max value
//   • for DATE columns: distribution of the stored UTC hour-of-day (helps spot
//     dates that were stored as "midnight in local tz" vs genuine timestamps)
//   • for DATEONLY columns: nothing extra (strings are tz-naive by design)

require('module-alias/register');
const { sequelize, models } = require('@/db');

const TABLES = [
  { table: 'invoices',      cols: [['date', 'DATEONLY'], ['expiredDate', 'DATEONLY'], ['created', 'DATE'], ['updated', 'DATE']] },
  { table: 'quotes',        cols: [['date', 'DATEONLY'], ['expiredDate', 'DATEONLY'], ['created', 'DATE'], ['updated', 'DATE']] },
  { table: 'payments',      cols: [['date', 'DATEONLY'], ['created', 'DATE'], ['updated', 'DATE']] },
  { table: 'product_costs', cols: [['date_from', 'DATEONLY'], ['date_to', 'DATEONLY'], ['created', 'DATE'], ['updated', 'DATE']] },
  { table: 'sales',         cols: [['date', 'DATE'], ['created', 'DATE'], ['updated', 'DATE']] },
  { table: 'release_notes', cols: [['date', 'DATEONLY'], ['created', 'DATE'], ['updated', 'DATE']] },
  { table: 'user_sessions', cols: [['startedAt', 'DATE'], ['lastActiveAt', 'DATE'], ['endedAt', 'DATE']] },
];

function parseTz() {
  const arg = process.argv.find((a) => a.startsWith('--tz='));
  return arg ? arg.slice(5) : 'Australia/Sydney';
}

async function auditColumn(table, [col, kind], tz) {
  const q = (sql, replacements = {}) =>
    sequelize.query(sql, { replacements, type: sequelize.QueryTypes.SELECT });

  const [counts] = await q(
    `SELECT COUNT(*)::int AS total,
            COUNT("${col}")::int AS non_null,
            MIN("${col}")::text AS min_val,
            MAX("${col}")::text AS max_val
       FROM ${table}`,
  );

  const line = `  ${col.padEnd(14)} ${kind.padEnd(8)} total=${counts.total} non_null=${counts.non_null} min=${counts.min_val ?? '-'} max=${counts.max_val ?? '-'}`;
  console.log(line);

  if (kind === 'DATE' && counts.non_null > 0) {
    // Hour-of-day distribution in UTC and in local tz.
    const rows = await q(
      `SELECT EXTRACT(HOUR FROM "${col}" AT TIME ZONE 'UTC')::int AS utc_hour,
              EXTRACT(HOUR FROM ("${col}" AT TIME ZONE 'UTC') AT TIME ZONE :tz)::int AS local_hour,
              COUNT(*)::int AS n
         FROM ${table}
        WHERE "${col}" IS NOT NULL
        GROUP BY utc_hour, local_hour
        ORDER BY n DESC
        LIMIT 5`,
      { tz },
    );
    const sample = rows
      .map((r) => `UTC ${String(r.utc_hour).padStart(2, '0')}:00 / ${tz} ${String(r.local_hour).padStart(2, '0')}:00 (${r.n})`)
      .join('  ');
    console.log(`    top hours: ${sample}`);
  }
}

(async () => {
  const tz = parseTz();
  console.log(`Audit timezone: ${tz}\n`);

  try {
    await sequelize.authenticate();
  } catch (e) {
    console.error('DB connect failed:', e.message);
    process.exit(2);
  }

  for (const { table, cols } of TABLES) {
    // Skip tables that don't exist yet (e.g. release_notes pre-deploy).
    try {
      await sequelize.query(`SELECT 1 FROM ${table} LIMIT 1`);
    } catch (e) {
      console.log(`${table}: (not present — skipped)\n`);
      continue;
    }
    console.log(`${table}`);
    for (const col of cols) {
      try {
        await auditColumn(table, col, tz);
      } catch (e) {
        console.log(`  ${col[0]} — error: ${e.message}`);
      }
    }
    console.log();
  }

  await sequelize.close();
})();
