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

  const statuses = ['draft', 'pending', 'sent', 'expired', 'declined', 'accepted'];

  const rows = await models.Quote.findAll({
    where: { removed: false },
    attributes: [
      'status',
      [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
      [sequelize.fn('SUM', sequelize.col('total')), 'total_amount'],
    ],
    group: ['status'],
    raw: true,
  });

  const totalCount = rows.reduce((acc, r) => acc + parseInt(r.count), 0);
  const resultMap = Object.fromEntries(rows.map((r) => [r.status, r]));

  const result = statuses.map((status) => {
    const r = resultMap[status];
    if (!r) {
      return { status, count: 0, percentage: 0, total_amount: 0 };
    }
    const count = parseInt(r.count) || 0;
    return {
      status,
      count,
      percentage: totalCount > 0 ? Math.round((count / totalCount) * 100) : 0,
      total_amount: parseFloat(r.total_amount) || 0,
    };
  });

  const total = result.reduce((acc, item) => acc + item.total_amount, 0);

  const finalResult = {
    total,
    type: defaultType,
    performance: result,
  };

  return res.status(200).json({
    success: true,
    result: finalResult,
    message: `Successfully found all Quotations for the last ${defaultType}`,
  });
};

module.exports = summary;
