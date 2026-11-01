const Joi = require('joi');
const { models } = require('@/db');
const authUser = require('./authUser');

const login = async (req, res, { userModel }) => {
  const { email, password } = req.body;

  const { error } = Joi.object({
    email:    Joi.string().email({ tlds: { allow: true } }).required(),
    password: Joi.string().required(),
  }).validate({ email, password });

  if (error) {
    return res.status(409).json({ success: false, result: null, message: 'Invalid/Missing credentials.', errorMessage: error.message });
  }

  const user = await models.Admin.findOne({ where: { email, removed: false } });
  if (!user) {
    return res.status(404).json({ success: false, result: null, message: 'No account with this email has been registered.' });
  }

  const databasePassword = await models.AdminPassword.findOne({ where: { admin_id: user.id, removed: false } });

  if (!user.enabled) {
    return res.status(409).json({ success: false, result: null, message: 'Your account is disabled, contact your account administrator.' });
  }

  authUser(req, res, { user, databasePassword });
};

module.exports = login;
