// Centralized date/time transformation layer. Rules:
//   DB stores UTC. Backend processes UTC. User sees local.
//   DATE columns = moment in time → UTC ISO.
//   DATEONLY columns = calendar date → plain 'YYYY-MM-DD'.
// Every date transform in the backend goes through this module.

const moment = require('moment-timezone');

const DEFAULT_TZ = 'UTC';

function resolveTz(tz) {
  if (!tz) return DEFAULT_TZ;
  return moment.tz.zone(tz) ? tz : DEFAULT_TZ;
}

// Resolve the acting user's timezone for a request.
// Priority: X-User-Timezone header → tz query param → global app setting → UTC.
async function getUserTz(req) {
  const header = req?.headers?.['x-user-timezone'];
  if (header && moment.tz.zone(header)) return header;

  const q = req?.query?.timezone || req?.query?.tz;
  if (q && moment.tz.zone(q)) return q;

  try {
    const { models } = require('@/db');
    const setting = await models.Setting.findOne({
      where: { settingKey: 'idurar_app_timezone' },
    });
    const val = setting?.settingValue;
    if (val && moment.tz.zone(val)) return val;
  } catch (_) {}

  return DEFAULT_TZ;
}

// Any input interpreted as instant in `tz` → UTC ISO string.
// If input is already an ISO with an offset, its offset wins and tz is ignored.
function toUtc(input, tz = DEFAULT_TZ) {
  if (input == null || input === '') return null;
  const zone = resolveTz(tz);

  if (typeof input === 'string' && /Z|[+-]\d{2}:?\d{2}$/.test(input)) {
    return moment.utc(input).toISOString();
  }
  return moment.tz(input, zone).utc().toISOString();
}

// UTC input → moment object in `tz`. Use .format(...) on the result.
function fromUtc(input, tz = DEFAULT_TZ) {
  if (input == null || input === '') return null;
  return moment.utc(input).tz(resolveTz(tz));
}

// Any input → plain 'YYYY-MM-DD' as the user sees it in `tz`.
// Use for DATEONLY columns (calendar dates). Passthrough if input is already 'YYYY-MM-DD'.
function toCalendarDate(input, tz = DEFAULT_TZ) {
  if (input == null || input === '') return null;
  if (typeof input === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(input)) return input;
  const zone = resolveTz(tz);
  return moment.tz(input, zone).format('YYYY-MM-DD');
}

// UTC input → formatted string in `tz`. Default format matches the frontend display.
function formatDisplay(input, fmt = 'DD/MM/YYYY', tz = DEFAULT_TZ) {
  if (input == null || input === '') return '';
  if (typeof input === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(input)) {
    return moment(input, 'YYYY-MM-DD').format(fmt);
  }
  return moment.utc(input).tz(resolveTz(tz)).format(fmt);
}

// Range filter bounds: 'start of local day' and 'end of local day' as UTC ISO.
function startOfDayUtc(input, tz = DEFAULT_TZ) {
  if (input == null || input === '') return null;
  return moment.tz(input, resolveTz(tz)).startOf('day').utc().toISOString();
}

function endOfDayUtc(input, tz = DEFAULT_TZ) {
  if (input == null || input === '') return null;
  return moment.tz(input, resolveTz(tz)).endOf('day').utc().toISOString();
}

// Current year in the user's timezone (used by invoice numbering).
function currentYear(tz = DEFAULT_TZ) {
  return moment.tz(resolveTz(tz)).year();
}

// Calendar-date arithmetic for DATEONLY columns (no tz math).
// Input: 'YYYY-MM-DD' → output: 'YYYY-MM-DD' one day earlier.
function dayBefore(calendarDate) {
  if (!calendarDate) return null;
  return moment(calendarDate, 'YYYY-MM-DD').subtract(1, 'day').format('YYYY-MM-DD');
}

module.exports = {
  DEFAULT_TZ,
  getUserTz,
  toUtc,
  fromUtc,
  toCalendarDate,
  formatDisplay,
  startOfDayUtc,
  endOfDayUtc,
  currentYear,
  dayBefore,
};
