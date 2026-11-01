const { models, sequelize } = require('@/db');
const { Op } = require('sequelize');
const moment = require('moment');

const summary = async (Model, req, res) => {
  let defaultType = 'month';
  const { type } = req.query;

  if (type && ['week', 'month', 'year'].includes(type)) {
    defaultType = type;
  } else if (type) {
    return res.status(400).json({
      success: false,
      result: null,
      message: 'Invalid type',
    });
  }

  const currentDate = moment();
  const startDate = currentDate.clone().startOf(defaultType).toDate();
  const endDate = currentDate.clone().endOf(defaultType).toDate();

  const [totalClients, totalNewClients, activeClientsRows] = await Promise.all([
    Model.count({
      where: { removed: false, enabled: true },
    }),
    Model.count({
      where: {
        removed: false,
        enabled: true,
        created: { [Op.gte]: startDate, [Op.lte]: endDate },
      },
    }),
    sequelize.query(
      `SELECT COUNT(DISTINCT c.id) AS count
         FROM clients c
         INNER JOIN invoices i ON i.client_id = c.id
         WHERE c.removed = false
           AND c.enabled = true
           AND i.removed = false`,
      { type: sequelize.QueryTypes.SELECT }
    ),
  ]);

  const activeClients = activeClientsRows && activeClientsRows[0]
    ? parseInt(activeClientsRows[0].count, 10) || 0
    : 0;

  const totalActiveClientsPercentage = totalClients > 0 ? (activeClients / totalClients) * 100 : 0;
  const totalNewClientsPercentage = totalClients > 0 ? (totalNewClients / totalClients) * 100 : 0;

  return res.status(200).json({
    success: true,
    result: {
      new: Math.round(totalNewClientsPercentage),
      active: Math.round(totalActiveClientsPercentage),
    },
    message: 'Successfully get summary of new clients',
  });
};

module.exports = summary;
