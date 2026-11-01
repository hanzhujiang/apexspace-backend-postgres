const { models } = require('@/db');
const { ALL_ROLES } = require('../../../constants/roles');

const ALLOWED_ROLES = ALL_ROLES;

const updateAdmin = async (userModel, req, res) => {
  const Model = models[userModel];
  const { id } = req.params;
  const { role, enabled } = req.body;

  const updates = {};
  if (role !== undefined) {
    if (!ALLOWED_ROLES.includes(role)) {
      return res.status(400).json({ success: false, result: null, message: 'Invalid role.' });
    }
    updates.role = role;
  }
  if (enabled !== undefined) updates.enabled = enabled;

  const [count] = await Model.update(updates, {
    where: { id, removed: false },
  });

  if (count === 0) {
    return res.status(404).json({ success: false, result: null, message: 'Admin not found.' });
  }

  const result = await Model.findOne({
    where: { id },
    attributes: ['id', 'name', 'surname', 'email', 'role', 'enabled', 'photo'],
  });

  return res.status(200).json({
    success: true,
    result,
    message: 'Admin updated successfully.',
  });
};

module.exports = updateAdmin;
