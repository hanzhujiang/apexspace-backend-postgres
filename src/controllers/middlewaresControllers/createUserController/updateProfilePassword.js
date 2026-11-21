const { models } = require('@/db');
const bcrypt = require('bcryptjs');
const { generate: uniqueId } = require('shortid');

const updateProfilePassword = async (userModel, req, res) => {
  const PasswordModel = models[userModel + 'Password'];

  const reqUserName = userModel.toLowerCase();
  const userProfile = req[reqUserName];
  const { currentPassword, password } = req.body;

  if (!currentPassword || !password) {
    return res.status(400).json({
      success: false,
      result: null,
      message: 'Current and new password are required.',
    });
  }

  if (password.length < 8) {
    return res.status(400).json({
      success: false,
      result: null,
      message: 'The new password needs to be at least 8 characters long.',
    });
  }

  const passwordRecord = await PasswordModel.findOne({
    where: { admin_id: userProfile.id, removed: false },
  });

  if (!passwordRecord) {
    return res.status(404).json({
      success: false,
      result: null,
      message: 'Password record not found.',
    });
  }

  const isMatch = await bcrypt.compare(
    passwordRecord.salt + currentPassword,
    passwordRecord.password
  );
  if (!isMatch) {
    return res.status(401).json({
      success: false,
      result: null,
      message: 'Current password is incorrect.',
    });
  }

  const salt = uniqueId();
  const passwordHash = bcrypt.hashSync(salt + password);

  const [count] = await PasswordModel.update(
    { password: passwordHash, salt },
    { where: { admin_id: userProfile.id, removed: false } }
  );

  if (count === 0) {
    return res.status(500).json({
      success: false,
      result: null,
      message: "User Password couldn't save correctly",
    });
  }

  return res.status(200).json({
    success: true,
    result: {},
    message: 'Password updated successfully.',
  });
};

module.exports = updateProfilePassword;
