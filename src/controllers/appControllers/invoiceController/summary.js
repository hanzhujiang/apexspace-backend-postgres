const { models, sequelize } = require('@/db');
const moment = require('moment');

const { loadSettings } = require('@/middlewares/settings');

const summary = async (req, res) => {
  let defaultType = 'month';

  const { type } = req.query;

  const settings = await loadSettings();

  if (type) {
    if (['week', 'month', 'year'].includes(type)) {
      defaultType = type;
    } else {
      return res.status(400).json({
        success: false,
        result: null,
        message: 'Invalid type',
      });
    }
  }

  const currentDate = moment();
  let startDate = currentDate.clone().startOf(defaultType);
  let endDate = currentDate.clone().endOf(defaultType);

  const statuses = ['draft', 'pending', 'overdue', 'paid', 'unpaid', 'partially'];

  // Aggregate counts/totals via Postgres GROUP BY. Postgres is case-sensitive
  // for mixed-case columns so camelCase identifiers must be double-quoted.
  const [totalsRow] = await sequelize.query(
    `SELECT
       COUNT(*)::int                     AS count,
       COALESCE(SUM("total"), 0)::float  AS total
     FROM invoices
     WHERE removed = false`,
    { type: sequelize.QueryTypes.SELECT }
  );

  const statusRows = await sequelize.query(
    `SELECT status AS status, COUNT(*)::int AS count
       FROM invoices
      WHERE removed = false
      GROUP BY status`,
    { type: sequelize.QueryTypes.SELECT }
  );

  const paymentStatusRows = await sequelize.query(
    `SELECT "paymentStatus" AS status, COUNT(*)::int AS count
       FROM invoices
      WHERE removed = false
      GROUP BY "paymentStatus"`,
    { type: sequelize.QueryTypes.SELECT }
  );

  const overdueRows = await sequelize.query(
    `SELECT status AS status, COUNT(*)::int AS count
       FROM invoices
      WHERE removed = false
        AND "expiredDate" < NOW()
      GROUP BY status`,
    { type: sequelize.QueryTypes.SELECT }
  );

  const totalCount = totalsRow ? Number(totalsRow.count) || 0 : 0;
  const totalAmount = totalsRow ? Number(totalsRow.total) || 0 : 0;

  const totalInvoices = { total: totalAmount, count: totalCount };

  const safePercent = (count) =>
    totalInvoices.count > 0 ? Math.round((count / totalInvoices.count) * 100) : 0;

  const statusResultMap = statusRows.map((item) => ({
    status: item.status,
    count: Number(item.count),
    percentage: safePercent(Number(item.count)),
  }));

  const paymentStatusResultMap = paymentStatusRows.map((item) => ({
    status: item.status,
    count: Number(item.count),
    percentage: safePercent(Number(item.count)),
  }));

  const overdueResultMap = overdueRows.map((item) => ({
    status: 'overdue',
    count: Number(item.count),
    percentage: safePercent(Number(item.count)),
  }));

  let result = [];
  statuses.forEach((status) => {
    const found = [...paymentStatusResultMap, ...statusResultMap, ...overdueResultMap].find(
      (item) => item.status === status
    );
    if (found) {
      result.push(found);
    }
  });

  const [unpaidRow] = await sequelize.query(
    `SELECT COALESCE(SUM("total" - "credit"), 0)::float AS total_amount
       FROM invoices
      WHERE removed = false
        AND "paymentStatus" IN ('unpaid', 'partially')`,
    { type: sequelize.QueryTypes.SELECT }
  );

  const finalResult = {
    total: totalInvoices?.total,
    total_undue: unpaidRow ? Number(unpaidRow.total_amount) || 0 : 0,
    type,
    performance: result,
  };

  return res.status(200).json({
    success: true,
    result: finalResult,
    message: `Successfully found all invoices for the last ${defaultType}`,
  });
};

module.exports = summary;
