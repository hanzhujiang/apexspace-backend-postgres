const { models, sequelize } = require('@/db');
const createCRUDController = require('@/controllers/middlewaresControllers/createCRUDController');

// Convert an Inventory row (with warehouseStock association) into a plain object
// that preserves the Mongoose-era shape: stock & on_the_way as objects keyed by
// warehouse business id.
function shapeInventory(record) {
  if (!record) return record;
  const plain = typeof record.toJSON === 'function' ? record.toJSON() : { ...record };

  const stock = {};
  const on_the_way = {};
  const rows = plain.warehouseStock || [];
  for (const row of rows) {
    stock[row.warehouse_id] = Number(row.stock) || 0;
    on_the_way[row.warehouse_id] = Number(row.on_the_way) || 0;
  }
  plain.stock = stock;
  plain.on_the_way = on_the_way;
  delete plain.warehouseStock;
  return plain;
}

async function loadShapedInventory(id) {
  const row = await models.Inventory.findOne({
    where: { id, removed: false },
    include: [{ model: models.InventoryWarehouseStock, as: 'warehouseStock' }],
  });
  return shapeInventory(row);
}

async function recomputeStockAll(inventoryId, transaction) {
  const rows = await models.InventoryWarehouseStock.findAll({
    where: { inventory_id: inventoryId },
    transaction,
  });
  const total = rows.reduce((sum, r) => sum + (Number(r.stock) || 0), 0);
  await models.Inventory.update(
    { stock_all: total, updated: new Date() },
    { where: { id: inventoryId }, transaction }
  );
  return total;
}

function modelController() {
  const Inventory = models.Inventory;
  const InventoryWarehouseStock = models.InventoryWarehouseStock;
  const Warehouse = models.Warehouse;
  const methods = createCRUDController('Inventory');

  // Override update + delete so responses carry the Mongoose-era
  // {stock: {wh:n}, on_the_way: {wh:n}} map adapter, matching list/read/create.
  methods.update = async (req, res) => {
    const payload = { ...req.body };
    // Never allow callers to directly mutate junction-derived fields via /update.
    delete payload.stock;
    delete payload.on_the_way;
    delete payload.stock_all;
    delete payload.warehouseStock;
    payload.removed = false;

    const [count] = await models.Inventory.update(payload, {
      where: { id: req.params.id, removed: false },
    });
    if (count === 0) {
      return res.status(404).json({ success: false, result: null, message: 'No document found' });
    }
    const shaped = await loadShapedInventory(req.params.id);
    return res.status(200).json({ success: true, result: shaped, message: 'Updated' });
  };

  methods.delete = async (req, res) => {
    const [count] = await models.Inventory.update(
      { removed: true },
      { where: { id: req.params.id, removed: false } }
    );
    if (count === 0) {
      return res.status(404).json({ success: false, result: null, message: 'No document found' });
    }
    // After soft-delete the row still exists; shape it for frontend consistency.
    const row = await models.Inventory.findOne({
      where: { id: req.params.id },
      include: [{ model: models.InventoryWarehouseStock, as: 'warehouseStock' }],
    });
    return res.status(200).json({ success: true, result: shapeInventory(row), message: 'Deleted' });
  };

  // Override create: initialize stock/on_the_way for all existing warehouses
  methods.create = async (req, res) => {
    const payload = { ...req.body, removed: false };
    // Strip map-shaped fields the client may send; we seed junction rows instead.
    const clientStock = payload.stock && typeof payload.stock === 'object' ? payload.stock : null;
    const clientOnTheWay = payload.on_the_way && typeof payload.on_the_way === 'object' ? payload.on_the_way : null;
    delete payload.stock;
    delete payload.on_the_way;
    delete payload.stock_all;

    const result = await sequelize.transaction(async (t) => {
      const warehouses = await Warehouse.findAll({
        where: { removed: false },
        transaction: t,
      });

      const inventory = await Inventory.create({ ...payload, stock_all: 0 }, { transaction: t });

      if (warehouses.length) {
        const seedRows = warehouses.map((w) => ({
          inventory_id: inventory.id,
          warehouse_id: w.warehouse_id,
          stock: clientStock && clientStock[w.warehouse_id] != null ? Number(clientStock[w.warehouse_id]) || 0 : 0,
          on_the_way: clientOnTheWay && clientOnTheWay[w.warehouse_id] != null ? Number(clientOnTheWay[w.warehouse_id]) || 0 : 0,
        }));
        await InventoryWarehouseStock.bulkCreate(seedRows, { transaction: t });
      }

      await recomputeStockAll(inventory.id, t);
      return inventory.id;
    });

    const shaped = await loadShapedInventory(result);
    return res.status(200).json({
      success: true,
      result: shaped,
      message: 'Successfully Created the document in Model',
    });
  };

  // Override read / list / listAll to shape warehouseStock back into map-style fields
  methods.read = async (req, res) => {
    const shaped = await loadShapedInventory(req.params.id);
    if (!shaped) return res.status(404).json({ success: false, result: null, message: 'No document found' });
    return res.status(200).json({ success: true, result: shaped, message: 'Found' });
  };

  methods.list = async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.items) || 10;
    const offset = (page - 1) * limit;
    const { sortBy = 'id', sortValue = -1 } = req.query;

    const { rows, count } = await Inventory.findAndCountAll({
      where: { removed: false },
      include: [{ model: InventoryWarehouseStock, as: 'warehouseStock' }],
      offset,
      limit,
      order: [[sortBy, sortValue == -1 || sortValue === 'desc' ? 'DESC' : 'ASC']],
      distinct: true,
    });

    const result = rows.map(shapeInventory);
    const pages = Math.ceil(count / limit);
    const pagination = { page, pages, count };

    if (count > 0) {
      return res.status(200).json({ success: true, result, pagination, message: 'Found all documents' });
    }
    return res.status(203).json({ success: true, result: [], pagination, message: 'Collection is Empty' });
  };

  methods.listAll = async (req, res) => {
    const rows = await Inventory.findAll({
      where: { removed: false },
      include: [{ model: InventoryWarehouseStock, as: 'warehouseStock' }],
      order: [['created', 'DESC']],
    });
    const result = rows.map(shapeInventory);
    if (result.length > 0) {
      return res.status(200).json({ success: true, result, message: 'Found all documents' });
    }
    return res.status(203).json({ success: false, result: [], message: 'Collection is Empty' });
  };

  // Move on_the_way[warehouseId] into stock[warehouseId] and recalculate stock_all
  methods.arrived = async (req, res) => {
    const { id } = req.params;
    const { warehouseId } = req.body;

    const inventory = await Inventory.findOne({ where: { id, removed: false } });
    if (!inventory) {
      return res.status(404).json({ success: false, message: 'Inventory record not found' });
    }

    await sequelize.transaction(async (t) => {
      const [row] = await InventoryWarehouseStock.findOrCreate({
        where: { inventory_id: inventory.id, warehouse_id: warehouseId },
        defaults: { inventory_id: inventory.id, warehouse_id: warehouseId, stock: 0, on_the_way: 0 },
        transaction: t,
      });

      const onTheWayAmount = Number(row.on_the_way) || 0;
      const currentStock = Number(row.stock) || 0;

      await row.update(
        { stock: currentStock + onTheWayAmount, on_the_way: 0 },
        { transaction: t }
      );

      await recomputeStockAll(inventory.id, t);
    });

    const shaped = await loadShapedInventory(id);
    return res.status(200).json({
      success: true,
      result: shaped,
      message: 'Stock arrived successfully',
    });
  };

  // Update on_the_way amount for a specific warehouse
  methods.updateOnTheWay = async (req, res) => {
    const { id } = req.params;
    const { warehouseId, amount } = req.body;

    const inventory = await Inventory.findOne({ where: { id, removed: false } });
    if (!inventory) {
      return res.status(404).json({ success: false, message: 'Inventory record not found' });
    }

    await sequelize.transaction(async (t) => {
      const [row] = await InventoryWarehouseStock.findOrCreate({
        where: { inventory_id: inventory.id, warehouse_id: warehouseId },
        defaults: { inventory_id: inventory.id, warehouse_id: warehouseId, stock: 0, on_the_way: 0 },
        transaction: t,
      });

      await row.update({ on_the_way: Number(amount) || 0 }, { transaction: t });
      await models.Inventory.update(
        { updated: new Date() },
        { where: { id: inventory.id }, transaction: t }
      );
    });

    const shaped = await loadShapedInventory(id);
    return res.status(200).json({
      success: true,
      result: shaped,
      message: 'On-the-way updated successfully',
    });
  };

  return methods;
}

module.exports = modelController();
