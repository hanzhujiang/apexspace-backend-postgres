const { getUserTz } = require('@/utils/dateTime');

// Attaches `req.userTz` (IANA zone) to every request. Resolution order:
//   X-User-Timezone header → ?timezone / ?tz query → global app setting → UTC.
// Controllers should prefer `req.userTz` over re-reading the header.
const userTimezone = async (req, res, next) => {
  try {
    req.userTz = await getUserTz(req);
  } catch (_) {
    req.userTz = 'UTC';
  }
  next();
};

module.exports = userTimezone;
