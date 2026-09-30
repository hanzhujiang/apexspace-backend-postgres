const mongoose = require('mongoose');
const { generate: uniqueId } = require('shortid');
const { ALL_ROLES } = require('../../../constants/roles');

const createAdmin = async (userModel, req, res) => {
  const User = mongoose.model(userModel);
  const UserPassword = mongoose.model(userModel + 'Password');

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

  const existing = await User.findOne({ email: email.toLowerCase(), removed: false });
  if (existing) {
    return res.status(409).json({
      success: false,
      result: null,
      message: 'An admin with this email already exists.',
    });
  }

  const newUser = await new User({
    email,
    name,
    surname: surname || '',
    enabled: true,
    role: assignedRole,
  }).save();

  const newUserPassword = new UserPassword();
  const salt = uniqueId();
  const passwordHash = newUserPassword.generateHash(salt, password);

  await new UserPassword({
    password: passwordHash,
    salt,
    emailVerified: true,
    user: newUser._id,
  }).save();

  return res.status(200).json({
    success: true,
    result: {
      _id: newUser._id,
      email: newUser.email,
      name: newUser.name,
      surname: newUser.surname,
      role: newUser.role,
    },
    message: 'Admin created successfully.',
  });
};

module.exports = createAdmin;
