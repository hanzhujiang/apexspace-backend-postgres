const { models } = require('@/db');

const updateProfile = async (userModel, req, res) => {
  const Model = models[userModel];

  const reqUserName = userModel.toLowerCase();
  const userProfile = req[reqUserName];

  const updates = {
    email: req.body.email,
    name: req.body.name,
    surname: req.body.surname,
  };
  if (req.body.photo) updates.photo = req.body.photo;

  // Find row by id and apply updates
  const [count] = await Model.update(updates, {
    where: { id: userProfile.id, removed: false },
  });

  if (count === 0) {
    return res.status(404).json({
      success: false,
      result: null,
      message: 'No profile found by this id: ' + userProfile.id,
    });
  }

  const result = await Model.findOne({ where: { id: userProfile.id } });

  return res.status(200).json({
    success: true,
    result: {
      _id: result?.id,
      enabled: result?.enabled,
      email: result?.email,
      name: result?.name,
      surname: result?.surname,
      photo: result?.photo,
      role: result?.role,
    },
    message: 'we update this profile by this id: ' + userProfile.id,
  });
};

module.exports = updateProfile;
