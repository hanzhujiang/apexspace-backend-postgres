// Standalone verification for the DateTimeService. Run: node scripts/verifyDateTime.js
// Does NOT touch the database.

require('module-alias/register');
const assert = require('assert');
const {
  toUtc,
  fromUtc,
  toCalendarDate,
  formatDisplay,
  startOfDayUtc,
  endOfDayUtc,
  currentYear,
  dayBefore,
} = require('../src/utils/dateTime');

const AEDT = 'Australia/Sydney';          // UTC+11 in Nov (DST)
const PST  = 'America/Los_Angeles';       // UTC-8 in Nov

const cases = [];
const check = (name, actual, expected) =>
  cases.push({ name, pass: actual === expected, actual, expected });

// ─── toUtc: user-local → UTC ISO ──────────────────────────────────────────────
// A Sydney user picking "2026-11-09 10:00" means 2026-11-08T23:00:00Z.
check(
  'toUtc: AEDT local → UTC ISO',
  toUtc('2026-11-09 10:00', AEDT),
  '2026-11-08T23:00:00.000Z',
);
check(
  'toUtc: LA local → UTC ISO',
  toUtc('2026-11-09 10:00', PST),
  '2026-11-09T18:00:00.000Z',
);
check(
  'toUtc: already-UTC string is preserved',
  toUtc('2026-11-09T10:00:00Z', AEDT),
  '2026-11-09T10:00:00.000Z',
);
check('toUtc: null → null', toUtc(null, AEDT), null);

// ─── toCalendarDate: user-local → YYYY-MM-DD ─────────────────────────────────
// A Sydney user picking "midnight on Nov 9" must store 2026-11-09 (NOT 2026-11-08).
check(
  'toCalendarDate: AEDT midnight → user calendar day',
  toCalendarDate('2026-11-09T00:00:00+11:00', AEDT),
  '2026-11-09',
);
// A UTC ISO near midnight should be remapped to the user's calendar day.
check(
  'toCalendarDate: UTC 23:00 remaps to AEDT next day',
  toCalendarDate('2026-11-08T23:00:00Z', AEDT),
  '2026-11-09',
);
check(
  'toCalendarDate: passthrough plain YYYY-MM-DD',
  toCalendarDate('2026-11-09', AEDT),
  '2026-11-09',
);

// ─── formatDisplay ────────────────────────────────────────────────────────────
check(
  'formatDisplay: UTC ISO → DD/MM/YYYY in AEDT',
  formatDisplay('2026-11-08T23:00:00Z', 'DD/MM/YYYY', AEDT),
  '09/11/2026',
);
check(
  'formatDisplay: UTC ISO → DD/MM/YYYY in PST',
  formatDisplay('2026-11-08T23:00:00Z', 'DD/MM/YYYY', PST),
  '08/11/2026',
);
check(
  'formatDisplay: DATEONLY passthrough',
  formatDisplay('2026-11-09', 'DD/MM/YYYY', PST),
  '09/11/2026',
);
check('formatDisplay: null → empty', formatDisplay(null, 'DD/MM/YYYY', AEDT), '');

// ─── startOfDayUtc / endOfDayUtc ──────────────────────────────────────────────
check(
  'startOfDayUtc: AEDT day start',
  startOfDayUtc('2026-11-09', AEDT),
  '2026-11-08T13:00:00.000Z',
);
check(
  'endOfDayUtc: AEDT day end',
  endOfDayUtc('2026-11-09', AEDT),
  '2026-11-09T12:59:59.999Z',
);

// ─── dayBefore ────────────────────────────────────────────────────────────────
check('dayBefore: normal day',   dayBefore('2026-11-09'), '2026-11-08');
check('dayBefore: month boundary', dayBefore('2026-11-01'), '2026-10-31');
check('dayBefore: year boundary', dayBefore('2027-01-01'), '2026-12-31');

// ─── currentYear ──────────────────────────────────────────────────────────────
// Can't assert exact value, but it must be an integer >= 2026 and within a sane range.
const y = currentYear(AEDT);
check('currentYear: integer in range', typeof y === 'number' && y >= 2026 && y < 2100, true);

// ─── fromUtc round-trip ───────────────────────────────────────────────────────
const back = fromUtc('2026-11-08T23:00:00Z', AEDT);
check(
  'fromUtc: moment in AEDT',
  back.format('YYYY-MM-DD HH:mm'),
  '2026-11-09 10:00',
);

// ─── Report ───────────────────────────────────────────────────────────────────
let passed = 0, failed = 0;
for (const c of cases) {
  if (c.pass) {
    passed++;
    console.log(`  ✓ ${c.name}`);
  } else {
    failed++;
    console.log(`  ✗ ${c.name}`);
    console.log(`      expected: ${JSON.stringify(c.expected)}`);
    console.log(`      actual:   ${JSON.stringify(c.actual)}`);
  }
}
console.log(`\n${passed}/${passed + failed} passed`);
process.exit(failed === 0 ? 0 : 1);
