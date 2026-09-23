const mongoose = require('mongoose');

const listAdmins = async (userModel, req, res) => {
  const User = mongoose.model(userModel);

  const results = await User.find({ removed: false })
    .select('_id name surname email role enabled photo created')
    .sort({ created: 1 })
    .exec();

  return res.status(200).json({
    success: true,
    result: results,
    message: 'Admins fetched successfully.',
  });
};

module.exports = listAdmins;
