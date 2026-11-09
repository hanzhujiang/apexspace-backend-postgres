const createCRUDController = require('@/controllers/middlewaresControllers/createCRUDController');

function modelController() {
  const methods = createCRUDController('ReleaseNote');

  const requireOwner = (handler) => async (req, res) => {
    if (req.admin?.role !== 'owner') {
      return res.status(403).json({
        success: false,
        result: null,
        message: 'Only the owner can modify release notes.',
      });
    }
    return handler(req, res);
  };

  const originalCreate = methods.create;
  const originalUpdate = methods.update;
  const originalDelete = methods.delete;

  methods.create = requireOwner(originalCreate);
  methods.update = requireOwner(originalUpdate);
  methods.delete = requireOwner(originalDelete);

  return methods;
}

module.exports = modelController();
