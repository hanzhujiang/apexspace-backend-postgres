const { models } = require('@/db');

const ENTITY_TO_PERMISSION = {
  client:         'customer',
  invoice:        'invoice',
  quote:          'quote',
  payment:        'payment',
  paymentmode:    'paymentMode',
  taxes:          'taxes',
  sales:          'sales',
  case:           'sales',
  inventory:      'inventory',
  warehouse:      'warehouse',
  productcosts:   'productCosts',
  setting:        'settings',
  koganskuweight: 'shopSettings',
  chat:           'salesAssistant',
};

const checkPermission = async (req, res, next) => {
  const user = req.admin;
  if (!user || user.role === 'owner') return next();

  const entity = req.path.split('/').filter(Boolean)[0]?.toLowerCase();
  const permissionKey = ENTITY_TO_PERMISSION[entity];
  if (!permissionKey) return next();

  const rolePermission = await models.Permission.findOne({ where: { role: user.role } });
  if (!rolePermission || rolePermission.permissions[permissionKey] === false) {
    return res.status(403).json({ success: false, result: null, message: `You do not have permission to access ${permissionKey}.` });
  }

  next();
};

module.exports = checkPermission;
