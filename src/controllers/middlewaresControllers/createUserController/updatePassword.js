const { models } = require('@/db');
const bcrypt = require('bcryptjs');
const { generate: uniqueId } = require('shortid');

const updatePassword = async (userModel, req, res) => {
  const PasswordModel = models[userModel + 'Password'];

  const reqUserName = userModel.toLowerCase();
  const userProfile = req[reqUserName];

  let { password } = req.body;

  if (password.length < 8)
    return res.status(400).json({
      msg: 'The password needs to be at least 8 characters long.',
    });

  if (userProfile.email === 'admin@demo.com') {
    return res.status(403).json({
      success: false,
      result: null,
      message: "you couldn't update demo password",
    });
  }

  const salt = uniqueId();
  const passwordHash = bcrypt.hashSync(salt + password);

  const [count] = await PasswordModel.update(
    { password: passwordHash, salt },
    { where: { admin_id: req.params.id, removed: false } }
  );

  if (count === 0) {
    return res.status(403).json({
      success: false,
      result: null,
      message: "User Password couldn't save correctly",
    });
  }

  return res.status(200).json({
    success: true,
    result: {},
    message: 'we update the password by this id: ' + userProfile.id,
  });
};

module.exports = updatePassword;
