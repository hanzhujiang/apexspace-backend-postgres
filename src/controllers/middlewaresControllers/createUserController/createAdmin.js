const { models } = require('@/db');
const { generate: uniqueId } = require('shortid');
const bcrypt = require('bcryptjs');
const { ALL_ROLES } = require('../../../constants/roles');

const createAdmin = async (userModel, req, res) => {
  const Model = models[userModel];
  const PasswordModel = models[userModel + 'Password'];

  const { email, name, surname, password, role } = req.body;

  if (!email || !name || !password) {
    return res.status(400).json({
      success: false,
      result: null,
      message: 'Email, name, and password are required.',
    });
  }

  if (password.length < 8) {
    return res.status(400).json({
      success: false,
      result: null,
      message: 'Password must be at least 8 characters.',
    });
  }

  const assignedRole = role || 'admin';
  if (!ALL_ROLES.includes(assignedRole)) {
    return res.status(400).json({
      success: false,
      result: null,
      message: 'Invalid role.',
    });
  }

  const existing = await Model.findOne({
    where: { email: email.toLowerCase(), removed: false },
  });
  if (existing) {
    return res.status(409).json({
      success: false,
      result: null,
      message: 'An admin with this email already exists.',
    });
  }

  const newUser = await Model.create({
    email,
    name,
    surname: surname || '',
    enabled: true,
    role: assignedRole,
  });

  const salt = uniqueId();
  const passwordHash = bcrypt.hashSync(salt + password);

  await PasswordModel.create({
    password: passwordHash,
    salt,
    emailVerified: true,
    admin_id: newUser.id,
  });

  return res.status(200).json({
    success: true,
    result: {
      _id: newUser.id,
      email: newUser.email,
      name: newUser.name,
      surname: newUser.surname,
      role: newUser.role,
    },
    message: 'Admin created successfully.',
  });
};

module.exports = createAdmin;
