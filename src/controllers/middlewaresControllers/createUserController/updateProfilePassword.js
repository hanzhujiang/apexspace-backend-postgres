const { models } = require('@/db');
const bcrypt = require('bcryptjs');
const { generate: uniqueId } = require('shortid');

const updateProfilePassword = async (userModel, req, res) => {
  const PasswordModel = models[userModel + 'Password'];

  const reqUserName = userModel.toLowerCase();
  const userProfile = req[reqUserName];
  const { password, passwordCheck } = req.body;

  if (!password || !passwordCheck)
    return res.status(400).json({ msg: 'Not all fields have been entered.' });

  if (password.length < 8)
    return res.status(400).json({
      msg: 'The password needs to be at least 8 characters long.',
    });

  if (password !== passwordCheck)
    return res.status(400).json({ msg: 'Enter the same password twice for verification.' });

  const salt = uniqueId();
  const passwordHash = bcrypt.hashSync(salt + password);

  const [count] = await PasswordModel.update(
    { password: passwordHash, salt },
    { where: { admin_id: userProfile.id, removed: false } }
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

module.exports = updateProfilePassword;
