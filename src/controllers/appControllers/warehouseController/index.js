const { models, sequelize } = require('@/db');
const createCRUDController = require('@/controllers/middlewaresControllers/createCRUDController');

function modelController() {
  const Warehouse = models.Warehouse;
  const Inventory = models.Inventory;
  const InventoryWarehouseStock = models.InventoryWarehouseStock;
  const methods = createCRUDController('Warehouse');

  // Override create: after adding warehouse, add it to all inventory records at 0
  methods.create = async (req, res) => {
    const payload = { ...req.body, removed: false };

    const result = await sequelize.transaction(async (t) => {
      const warehouse = await Warehouse.create(payload, { transaction: t });

      if (warehouse.warehouse_id) {
        const inventories = await Inventory.findAll({
          where: { removed: false },
          attributes: ['id'],
          transaction: t,
        });

        if (inventories.length) {
          const seedRows = inventories.map((inv) => ({
            inventory_id: inv.id,
            warehouse_id: warehouse.warehouse_id,
            stock: 0,
            on_the_way: 0,
          }));
          await InventoryWarehouseStock.bulkCreate(seedRows, {
            transaction: t,
            ignoreDuplicates: true,
          });
        }
      }

      return warehouse;
    });

    return res.status(200).json({
      success: true,
      result,
      message: 'Successfully Created the document in Model',
    });
  };

  // delete/remove: default behavior (soft-remove on Warehouse row only) is correct —
  // junction rows are left intact so historical stock remains visible per warehouse.

  return methods;
}

module.exports = modelController();
