const mongoose = require('mongoose');
const createCRUDController = require('@/controllers/middlewaresControllers/createCRUDController');

function modelController() {
  const Inventory = mongoose.model('Inventory');
  const methods = createCRUDController('Inventory');

  // Override create: initialize stock/on_the_way for all existing warehouses
  methods.create = async (req, res) => {
    const Warehouse = mongoose.model('Warehouse');
    req.body.removed = false;

    const warehouses = await Warehouse.find({ removed: false });
    const stockMap = {};
    const onTheWayMap = {};
    warehouses.forEach((w) => {
      stockMap[w.warehouse_id] = 0;
      onTheWayMap[w.warehouse_id] = 0;
    });

    const result = await new Inventory({
      ...req.body,
      stock: stockMap,
      on_the_way: onTheWayMap,
      stock_all: 0,
    }).save();

    return res.status(200).json({
      success: true,
      result,
      message: 'Successfully Created the document in Model',
    });
  };

  // Move on_the_way[warehouseId] into stock[warehouseId] and recalculate stock_all
  methods.arrived = async (req, res) => {
    const { id } = req.params;
    const { warehouseId } = req.body;

    const inventory = await Inventory.findById(id);
    if (!inventory) {
      return res.status(404).json({ success: false, message: 'Inventory record not found' });
    }

    const onTheWayAmount = inventory.on_the_way.get(warehouseId) || 0;
    const currentStock = inventory.stock.get(warehouseId) || 0;

    inventory.stock.set(warehouseId, currentStock + onTheWayAmount);
    inventory.on_the_way.set(warehouseId, 0);

    let total = 0;
    inventory.stock.forEach((val) => { total += val; });
    inventory.stock_all = total;
    inventory.updated = new Date();

    await inventory.save();

    return res.status(200).json({
      success: true,
      result: inventory,
      message: 'Stock arrived successfully',
    });
  };

  // Update on_the_way amount for a specific warehouse
  methods.updateOnTheWay = async (req, res) => {
    const { id } = req.params;
    const { warehouseId, amount } = req.body;

    const inventory = await Inventory.findByIdAndUpdate(
      id,
      {
        $set: {
          [`on_the_way.${warehouseId}`]: Number(amount) || 0,
          updated: new Date(),
        },
      },
      { new: true }
    );

    if (!inventory) {
      return res.status(404).json({ success: false, message: 'Inventory record not found' });
    }

    return res.status(200).json({
      success: true,
      result: inventory,
      message: 'On-the-way updated successfully',
    });
  };

  return methods;
}

module.exports = modelController();
