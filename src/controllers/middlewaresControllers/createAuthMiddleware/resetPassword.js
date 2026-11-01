const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const Joi = require('joi');
const shortid = require('shortid');
const { models } = require('@/db');

const resetPassword = async (req, res, { userModel }) => {
  const { password, userId, resetToken } = req.body;

  const { error } = Joi.object({
    password:   Joi.string().required(),
    userId:     Joi.string().required(),
    resetToken: Joi.string().required(),
  }).validate({ password, userId, resetToken });

  if (error) {
    return res.status(409).json({ success: false, result: null, message: 'Invalid reset password object.', errorMessage: error.message });
  }

  const [user, databasePassword] = await Promise.all([
    models.Admin.findOne({ where: { id: userId, removed: false } }),
    models.AdminPassword.findOne({ where: { admin_id: userId, removed: false } }),
  ]);

  if (!user || !databasePassword) {
    return res.status(404).json({ success: false, result: null, message: 'No account found.' });
  }
  if (!user.enabled) {
    return res.status(409).json({ success: false, result: null, message: 'Your account is disabled.' });
  }
  if (!databasePassword.resetToken || resetToken !== databasePassword.resetToken) {
    return res.status(403).json({ success: false, result: null, message: 'Invalid reset token.' });
  }

  const salt = shortid.generate();
  const hashedPassword = bcrypt.hashSync(salt + password);
  const newToken = jwt.sign({ id: userId }, process.env.JWT_SECRET, { expiresIn: '24h' });

  await models.AdminPassword.update(
    { password: hashedPassword, salt, resetToken: shortid.generate(), emailVerified: true },
    { where: { admin_id: userId } }
  );

  // Add the new session
  await models.AdminSession.create({ admin_password_id: databasePassword.id, token: newToken });

  return res.status(200).json({
    success: true,
    result: { _id: user.id, name: user.name, surname: user.surname, role: user.role, email: user.email, photo: user.photo, token: newToken, maxAge: null },
    message: 'Password reset successfully.',
  });
};

module.exports = resetPassword;
