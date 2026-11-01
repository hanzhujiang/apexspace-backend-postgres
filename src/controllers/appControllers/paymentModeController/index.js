const { models, Op } = require('@/db');
const Model = models.PaymentMode;
const createCRUDController = require('@/controllers/middlewaresControllers/createCRUDController');
const methods = createCRUDController('PaymentMode');

delete methods['delete'];

methods.create = async (req, res) => {
  const { isDefault } = req.body;

  if (isDefault) {
    await Model.update({ isDefault: false }, { where: {} });
  }

  const countDefault = await Model.count({ where: { isDefault: true } });

  const created = await Model.create({
    ...req.body,
    removed: false,
    isDefault: countDefault < 1 ? true : false,
  });

  return res.status(200).json({
    success: true,
    result: created,
    message: 'payment mode created successfully',
  });
};

methods.delete = async (req, res) => {
  return res.status(403).json({
    success: false,
    result: null,
    message: "you can't delete payment mode after it has been created",
  });
};

methods.update = async (req, res) => {
  const { id } = req.params;
  const paymentMode = await Model.findOne({
    where: { id, removed: false },
  });

  if (!paymentMode) {
    return res.status(404).json({
      success: false,
      result: null,
      message: 'No document found',
    });
  }

  const { isDefault = paymentMode.isDefault, enabled = paymentMode.enabled } = req.body;

  // if isDefault:false , we update first - isDefault:true
  // if enabled:false and isDefault:true , we update first - isDefault:true
  if (!isDefault || (!enabled && isDefault)) {
    const other = await Model.findOne({
      where: { id: { [Op.ne]: id }, enabled: true, removed: false },
    });
    if (other) {
      await Model.update({ isDefault: true }, { where: { id: other.id } });
    }
  }

  // if isDefault:true and enabled:true, we update other paymentMode and make is isDefault:false
  if (isDefault && enabled) {
    await Model.update({ isDefault: false }, { where: { id: { [Op.ne]: id } } });
  }

  const paymentModeCount = await Model.count({ where: {} });

  // if enabled:false and it's only one exist, we can't disable
  if ((!enabled || !isDefault) && paymentModeCount <= 1) {
    return res.status(422).json({
      success: false,
      result: null,
      message: 'You cannot disable the paymentMode because it is the only existing one',
    });
  }

  await Model.update(req.body, { where: { id } });
  const result = await Model.findByPk(id);

  return res.status(200).json({
    success: true,
    message: 'paymentMode updated successfully',
    result,
  });
};

module.exports = methods;
