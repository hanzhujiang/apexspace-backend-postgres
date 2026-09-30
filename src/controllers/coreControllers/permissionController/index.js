const mongoose = require('mongoose');
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
  salesAssistant: true,
};

const list = async (req, res) => {
  const Permission = mongoose.model('Permission');

  // Seed any missing role documents with defaults
  await Promise.all(
    NON_OWNER_ROLES.map((role) =>
      Permission.findOneAndUpdate(
        { role },
        { $setOnInsert: { permissions: DEFAULT_PERMISSIONS } },
        { upsert: true, new: true }
      )
    )
  );

  const result = await Permission.find({ role: { $in: NON_OWNER_ROLES } }).sort({ role: 1 });

  return res.status(200).json({
    success: true,
    result,
    message: 'Permissions fetched successfully.',
  });
};

const update = async (req, res) => {
  const Permission = mongoose.model('Permission');
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

  const result = await Permission.findOneAndUpdate(
    { role },
    { $set: { permissions } },
    { new: true, upsert: true }
  );

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

  const Permission = mongoose.model('Permission');

  let rolePermission = await Permission.findOne({ role: user.role });
  if (!rolePermission) {
    rolePermission = await Permission.findOneAndUpdate(
      { role: user.role },
      { $setOnInsert: { permissions: DEFAULT_PERMISSIONS } },
      { upsert: true, new: true }
    );
  }

  return res.status(200).json({
    success: true,
    result: rolePermission,
    message: 'User permissions fetched successfully.',
  });
};

module.exports = { list, update, listMy };
