const mongoose = require('mongoose');
const createCRUDController = require('@/controllers/middlewaresControllers/createCRUDController');

function modelController() {
  const Warehouse = mongoose.model('Warehouse');
  const methods = createCRUDController('Warehouse');

  // Override create: after adding warehouse, add it to all inventory records at 0
  methods.create = async (req, res) => {
    req.body.removed = false;
    const result = await new Warehouse({ ...req.body }).save();

    const Inventory = mongoose.model('Inventory');
    const warehouseId = req.body.warehouse_id;
    if (warehouseId) {
      await Inventory.updateMany(
        { removed: false },
        {
          $set: {
            [`stock.${warehouseId}`]: 0,
            [`on_the_way.${warehouseId}`]: 0,
          },
        }
      );
    }

    return res.status(200).json({
      success: true,
      result,
      message: 'Successfully Created the document in Model',
    });
  };

  return methods;
}

module.exports = modelController();
