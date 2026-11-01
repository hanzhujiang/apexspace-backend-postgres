const Joi = require('joi');
const shortid = require('shortid');
const { models } = require('@/db');
const checkAndCorrectURL = require('./checkAndCorrectURL');
const sendMail = require('./sendMail');
const { useAppSettings } = require('@/settings');

const forgetPassword = async (req, res, { userModel }) => {
  const { email } = req.body;

  const { error } = Joi.object({
    email: Joi.string().email({ tlds: { allow: true } }).required(),
  }).validate({ email });

  if (error) {
    return res.status(409).json({ success: false, result: null, message: 'Invalid email.', errorMessage: error.message });
  }

  const user = await models.Admin.findOne({ where: { email, removed: false } });
  if (!user) {
    return res.status(404).json({ success: false, result: null, message: 'No account with this email has been registered.' });
  }

  const resetToken = shortid.generate();
  await models.AdminPassword.update({ resetToken }, { where: { admin_id: user.id } });

  const settings = useAppSettings();
  const idurar_app_email = settings['idurar_app_email'];
  const idurar_base_url  = settings['idurar_base_url'];
  const url  = checkAndCorrectURL(idurar_base_url);
  const link = `${url}/resetpassword/${user.id}/${resetToken}`;

  await sendMail({ email, name: user.name, link, subject: 'Reset your password', idurar_app_email, type: 'passwordVerfication' });

  return res.status(200).json({ success: true, result: null, message: 'Check your email inbox to reset your password.' });
};

module.exports = forgetPassword;
