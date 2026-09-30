const mongoose = require('mongoose');
const { ALL_ROLES } = require('../../../constants/roles');

const ALLOWED_ROLES = ALL_ROLES;

const updateAdmin = async (userModel, req, res) => {
  const User = mongoose.model(userModel);
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

  const result = await User.findOneAndUpdate(
    { _id: id, removed: false },
    { $set: updates },
    { new: true }
  ).select('_id name surname email role enabled photo').exec();

  if (!result) {
    return res.status(404).json({ success: false, result: null, message: 'Admin not found.' });
  }

  return res.status(200).json({
    success: true,
    result,
    message: 'Admin updated successfully.',
  });
};

module.exports = updateAdmin;
