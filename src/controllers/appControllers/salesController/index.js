const mongoose = require('mongoose');
const createCRUDController = require('@/controllers/middlewaresControllers/createCRUDController');

async function enrichWithSkuCosts(sales) {
  if (!sales.length) return sales;

  const ProductCosts = mongoose.model('ProductCosts');
  const skus = [...new Set(sales.map((s) => s.sku).filter(Boolean))];
  if (!skus.length) return sales.map((s) => (s.toObject ? s.toObject() : { ...s }));

  const costEntries = await ProductCosts.find({
    sku: { $in: skus },
    removed: { $ne: true },
  })
    .lean()
    .exec();

  return sales.map((sale) => {
    const plain = sale.toObject ? sale.toObject() : { ...sale };
    if (!plain.sku || !plain.date) return plain;

    const saleDate = new Date(plain.date);
    const match = costEntries
      .filter(
        (e) =>
          e.sku === plain.sku &&
          new Date(e.date_from) <= saleDate &&
          (e.date_to == null || new Date(e.date_to) >= saleDate)
      )
      .sort((a, b) => new Date(b.date_from) - new Date(a.date_from))[0];

    plain.cost_aud = match ? match.cost : null;
    return plain;
  });
}

async function salesList(Model, req, res) {
  const page = req.query.page || 1;
  const limit = parseInt(req.query.items) || 10;
  const skip = page * limit - limit;

  const fieldsArray = req.query.fields ? req.query.fields.split(',') : [];
  let searchFilter = {};
  if (fieldsArray.length > 0) {
    searchFilter.$or = fieldsArray.map((field) => ({
      [field]: { $regex: new RegExp(req.query.q || '', 'i') },
    }));
  }

  const baseQuery = { removed: { $ne: true }, ...searchFilter };

  const [rawResult, count] = await Promise.all([
    Model.find(baseQuery).skip(skip).limit(limit).sort({ created: -1 }).exec(),
    Model.countDocuments(baseQuery),
  ]);

  const result = await enrichWithSkuCosts(rawResult);
  const pages = Math.ceil(count / limit);
  const pagination = { page, pages, count };

  if (count > 0) {
    return res.status(200).json({
      success: true,
      result,
      pagination,
      message: 'Successfully found all documents',
    });
  } else {
    return res.status(203).json({
      success: true,
      result: [],
      pagination,
      message: 'Collection is Empty',
    });
  }
}

async function resolveStockEntry(sku, warehouseNickName) {
  if (!sku || !warehouseNickName) return null;

  const Warehouse = mongoose.model('Warehouse');
  const Inventory = mongoose.model('Inventory');

  const warehouse = await Warehouse.findOne({ nick_name: warehouseNickName, removed: false });
  if (!warehouse) return null;

  const inventory = await Inventory.findOne({ sku, removed: false });
  if (!inventory) return null;

  return { inventory, warehouseId: warehouse.warehouse_id };
}

async function deductInventory(sku, warehouseNickName, quantity) {
  const entry = await resolveStockEntry(sku, warehouseNickName);
  if (!entry) return;

  const { inventory, warehouseId } = entry;
  const current = inventory.stock.get(warehouseId) ?? 0;
  inventory.stock.set(warehouseId, current - Number(quantity));

  let total = 0;
  for (const val of inventory.stock.values()) total += Number(val) || 0;
  inventory.stock_all = total;
  inventory.updated = new Date();

  await inventory.save();
}

function modelController() {
  const Model = mongoose.model('Sales');
  const methods = createCRUDController('Sales');

  methods.create = async (req, res) => {
    req.body.createdBy = req.admin._id;
    req.body.removed = false;

    const { sku, warehouse_location, quantity } = req.body;

    if (sku && warehouse_location && quantity) {
      const entry = await resolveStockEntry(sku, warehouse_location);
      if (entry) {
        const available = entry.inventory.stock.get(entry.warehouseId) ?? 0;
        if (available < Number(quantity)) {
          return res.status(400).json({
            success: false,
            result: null,
            message: `Insufficient stock: only ${available} unit(s) available for this SKU at the selected warehouse.`,
          });
        }
      }
    }

    // cost_aud is not stored — computed from ProductCosts on every read
    delete req.body.cost_aud;

    const result = await new Model({ ...req.body }).save();

    await deductInventory(sku, warehouse_location, quantity);

    return res.status(200).json({
      success: true,
      result,
      message: 'Successfully Created the document in Model',
    });
  };

  methods.list = (req, res) => salesList(Model, req, res);

  methods.read = async (req, res) => {
    const sale = await Model.findOne({ _id: req.params.id, removed: false }).exec();
    if (!sale) {
      return res.status(404).json({ success: false, result: null, message: 'No document found' });
    }
    const [enriched] = await enrichWithSkuCosts([sale]);
    return res.status(200).json({ success: true, result: enriched, message: 'we found this document' });
  };

  return methods;
}

module.exports = modelController();
