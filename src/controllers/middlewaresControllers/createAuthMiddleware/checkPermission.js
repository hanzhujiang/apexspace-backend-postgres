const mongoose = require('mongoose');

// Maps URL entity path segments → permission key
const ENTITY_TO_PERMISSION = {
  client:      'customer',
  invoice:     'invoice',
  quote:       'quote',
  payment:     'payment',
  paymentmode: 'paymentMode',
  taxes:       'taxes',
  sales:       'sales',
  setting:     'settings',
  chat:        'salesAssistant',
};

const checkPermission = async (req, res, next) => {
  const user = req.admin;

  // Owners always have full access
  if (!user || user.role === 'owner') return next();

  const entity = req.path.split('/').filter(Boolean)[0]?.toLowerCase();
  const permissionKey = ENTITY_TO_PERMISSION[entity];

  // No mapping means no restriction needed
  if (!permissionKey) return next();

  const Permission = mongoose.model('Permission');
  const rolePermission = await Permission.findOne({ role: user.role });

  if (!rolePermission || rolePermission.permissions[permissionKey] === false) {
    return res.status(403).json({
      success: false,
      result: null,
      message: `You do not have permission to access ${permissionKey}.`,
    });
  }

  next();
};

module.exports = checkPermission;
