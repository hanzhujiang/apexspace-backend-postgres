const { models, Op } = require('@/db');
const { NON_OWNER_ROLES } = require('../../../constants/roles');

const DEFAULT_PERMISSIONS = {
  dashboard:      true,
  customer:       true,
  invoice:        true,
  quote:          true,
  payment:        true,
  paymentMode:    true,
  taxes:          true,
  sales:          true,
  toolings:       true,
  inventory:      true,
  warehouse:      true,
  productCosts:   true,
  settings:       false,
  shopSettings:   false,
  userSessions:   false,
  salesAssistant: true,
  // Dashboard card-level
  dashboardSummaryInvoices:     true,
  dashboardSummaryQuote:        true,
  dashboardSummaryPayment:      true,
  dashboardSummaryUnpaid:       true,
  dashboardChartInvoices:       true,
  dashboardChartQuote:          true,
  dashboardCustomers:           true,
  dashboardRecentSales:         true,
  dashboardTopSkus:             true,
  dashboardEmployeePerformance: true,
  // Shop Settings
  shopSettingsLoadDefaults:     false,
  shopSettingsDelete:           false,
};

const list = async (req, res) => {
  // Seed any missing role rows with defaults
  await Promise.all(
    NON_OWNER_ROLES.map((role) =>
      models.Permission.findOrCreate({
        where: { role },
        defaults: { permissions: DEFAULT_PERMISSIONS },
      })
    )
  );

  const docs = await models.Permission.findAll({
    where: { role: NON_OWNER_ROLES },
    order: [['role', 'ASC']],
  });
  const result = docs.map((doc) => ({
    ...doc.toJSON(),
    permissions: { ...DEFAULT_PERMISSIONS, ...doc.permissions },
  }));

  return res.status(200).json({
    success: true,
    result,
    message: 'Permissions fetched successfully.',
  });
};

const update = async (req, res) => {
  const { role, permissions } = req.body;

  if (!role || !permissions) {
    return res.status(400).json({
      success: false,
      result: null,
      message: 'Role and permissions are required.',
    });
  }

  if (!NON_OWNER_ROLES.includes(role)) {
    return res.status(400).json({
      success: false,
      result: null,
      message: 'Invalid role.',
    });
  }

  // Postgres upsert returns [instance, created] via RETURNING.
  const [upserted] = await models.Permission.upsert(
    { role, permissions },
    { returning: true }
  );
  // Defensive fallback: re-fetch the row if the driver did not surface it.
  const result = upserted || (await models.Permission.findOne({ where: { role } }));

  return res.status(200).json({
    success: true,
    result,
    message: 'Permissions updated successfully.',
  });
};

// Returns the calling user's own permissions (or full access object for owners)
const listMy = async (req, res) => {
  const user = req.admin;

  if (user.role === 'owner') {
    const allTrue = Object.fromEntries(Object.keys(DEFAULT_PERMISSIONS).map((k) => [k, true]));
    return res.status(200).json({
      success: true,
      result: { role: 'owner', permissions: allTrue },
      message: 'Owner has full access.',
    });
  }

  const [rolePermission] = await models.Permission.findOrCreate({
    where: { role: user.role },
    defaults: { permissions: DEFAULT_PERMISSIONS },
  });

  const merged = {
    ...rolePermission.toJSON(),
    permissions: { ...DEFAULT_PERMISSIONS, ...rolePermission.permissions },
  };

  return res.status(200).json({
    success: true,
    result: merged,
    message: 'User permissions fetched successfully.',
  });
};

module.exports = { list, update, listMy };
