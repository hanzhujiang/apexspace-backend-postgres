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

  const row = await models.Payment.findOne({
    where: { removed: false },
    attributes: [
      [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
      [sequelize.fn('SUM', sequelize.col('amount')), 'total'],
    ],
    raw: true,
  });

  const result = {
    count: parseInt(row?.count) || 0,
    total: parseFloat(row?.total) || 0,
  };

  return res.status(200).json({
    success: true,
    result,
    message: `Successfully fetched the summary of payment invoices for the last ${defaultType}`,
  });
};

module.exports = summary;
