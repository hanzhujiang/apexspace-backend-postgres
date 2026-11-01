const { models } = require('@/db');

const read = async (userModel, req, res) => {
  const Model = models[userModel];

  // Find row by id
  const tmpResult = await Model.findOne({
    where: { id: req.params.id, removed: false },
  });

  // If no row found, return document not found
  if (!tmpResult) {
    return res.status(404).json({
      success: false,
      result: null,
      message: 'No document found ',
    });
  }

  const result = {
    _id: tmpResult.id,
    enabled: tmpResult.enabled,
    email: tmpResult.email,
    name: tmpResult.name,
    surname: tmpResult.surname,
    photo: tmpResult.photo,
    role: tmpResult.role,
  };

  return res.status(200).json({
    success: true,
    result,
    message: 'we found this document ',
  });
};

module.exports = read;
