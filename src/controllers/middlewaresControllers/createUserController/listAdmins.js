const { models } = require('@/db');

const listAdmins = async (userModel, req, res) => {
  const Model = models[userModel];

  const results = await Model.findAll({
    where: { removed: false },
    attributes: ['id', 'name', 'surname', 'email', 'role', 'enabled', 'photo', 'created'],
    order: [['created', 'ASC']],
  });

  return res.status(200).json({
    success: true,
    result: results,
    message: 'Admins fetched successfully.',
  });
};

module.exports = listAdmins;
