const read = require('./read');
const updateProfile = require('./updateProfile');
const updatePassword = require('./updatePassword');
const updateProfilePassword = require('./updateProfilePassword');
const createAdmin = require('./createAdmin');
const listAdmins = require('./listAdmins');
const updateAdmin = require('./updateAdmin');
const listSessions = require('./listSessions');

const createUserController = (userModel) => {
  let userController = {};

  userController.updateProfile = (req, res) => updateProfile(userModel, req, res);
  userController.updatePassword = (req, res) => updatePassword(userModel, req, res);
  userController.updateProfilePassword = (req, res) => updateProfilePassword(userModel, req, res);
  userController.createAdmin = (req, res) => createAdmin(userModel, req, res);
  userController.listAdmins = (req, res) => listAdmins(userModel, req, res);
  userController.updateAdmin = (req, res) => updateAdmin(userModel, req, res);
  userController.listSessions = (req, res) => listSessions(userModel, req, res);

  userController.read = (req, res) => read(userModel, req, res);

  return userController;
};

module.exports = createUserController;
