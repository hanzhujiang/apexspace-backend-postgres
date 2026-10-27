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
    const q = req.query.q || '';
    const directFields = fieldsArray.filter((f) => f !== 'client_name');
    const orClauses = directFields.map((field) => ({
      [field]: { $regex: new RegExp(q, 'i') },
    }));
    if (fieldsArray.includes('client_name') && q) {
      const Client = mongoose.model('Client');
      const matchingClients = await Client.find(
        { name: { $regex: new RegExp(q, 'i') }, removed: { $ne: true } },
        '_id'
      ).lean();
      if (matchingClients.length > 0) {
        orClauses.push({ client: { $in: matchingClients.map((c) => c._id) } });
      }
    }
    if (orClauses.length > 0) searchFilter.$or = orClauses;
  }

  const baseQuery = { removed: { $ne: true }, ...searchFilter };

  const [rawResult, count] = await Promise.all([
    Model.find(baseQuery).skip(skip).limit(limit).sort({ shipping_no: 1, date: -1 }).exec(),
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

  methods.recentChart = async (req, res) => {
    const days = Math.min(parseInt(req.query.days) || 7, 90);
    const tz = (() => {
      try {
        const t = req.query.timezone || 'UTC';
        Intl.DateTimeFormat(undefined, { timeZone: t });
        return t;
      } catch {
        return 'UTC';
      }
    })();
    const now = new Date();
    const from = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

    const PLATFORMS = ['MyDeal', 'Amazon', 'Kogan', 'Bunnings', 'Shopify'];

    const raw = await Model.aggregate([
      { $match: { removed: { $ne: true }, date: { $gte: from, $lte: now } } },
      {
        $group: {
          _id: {
            date: { $dateToString: { format: '%Y-%m-%d', date: '$date', timezone: tz } },
            platform: '$platform',
          },
          qty: { $sum: '$quantity' },
        },
      },
      { $sort: { '_id.date': 1 } },
    ]);

    // Build date range in user's local timezone (oldest → newest)
    const toLocalDate = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(d);
    const dates = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      dates.push(toLocalDate(d));
    }

    // date → platform → qty
    const dataMap = {};
    for (const date of dates) {
      dataMap[date] = {};
      for (const p of PLATFORMS) dataMap[date][p] = 0;
    }
    for (const row of raw) {
      const date = row._id.date;
      if (!dataMap[date]) continue;
      const key = PLATFORMS.find((p) => p.toLowerCase() === (row._id.platform || '').toLowerCase());
      if (key) dataMap[date][key] += row.qty;
    }

    const chartData = dates.map((date) => {
      const entry = { date: date.slice(5).replace('-', '/') }; // MM/DD
      let total = 0;
      for (const p of PLATFORMS) {
        entry[p] = dataMap[date][p];
        total += entry[p];
      }
      entry.total = total;
      return entry;
    });

    return res.status(200).json({ success: true, result: { chartData, platforms: PLATFORMS } });
  };

  methods.topSkus = async (req, res) => {
    const days = Math.min(parseInt(req.query.days) || 30, 365);
    const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const result = await Model.aggregate([
      {
        $match: {
          removed: { $ne: true },
          date: { $gte: from },
          sku: { $exists: true, $ne: '' },
        },
      },
      {
        $group: {
          _id: '$sku',
          product_name: { $first: '$product_name' },
          totalQty: { $sum: '$quantity' },
        },
      },
      { $sort: { totalQty: -1 } },
      { $limit: 10 },
      { $project: { _id: 0, sku: '$_id', product_name: 1, totalQty: 1 } },
    ]);

    return res.status(200).json({ success: true, result });
  };

  methods.read = async (req, res) => {
    const sale = await Model.findOne({ _id: req.params.id, removed: false }).exec();
    if (!sale) {
      return res.status(404).json({ success: false, result: null, message: 'No document found' });
    }
    const [enriched] = await enrichWithSkuCosts([sale]);
    return res.status(200).json({ success: true, result: enriched, message: 'we found this document' });
  };

  methods.employeePerformance = async (req, res) => {
    const now = new Date();

    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);

    const weekStart = new Date(todayStart);
    const dow = weekStart.getDay();
    weekStart.setDate(weekStart.getDate() - (dow === 0 ? 6 : dow - 1)); // Monday

    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const result = await Model.aggregate([
      { $match: { removed: { $ne: true }, date: { $gte: monthStart } } },
      {
        $group: {
          _id: '$createdBy',
          today: { $sum: { $cond: [{ $gte: ['$date', todayStart] }, 1, 0] } },
          week: { $sum: { $cond: [{ $gte: ['$date', weekStart] }, 1, 0] } },
          month: { $sum: 1 },
        },
      },
      { $lookup: { from: 'admins', localField: '_id', foreignField: '_id', as: 'admin' } },
      { $unwind: '$admin' },
      {
        $project: {
          _id: 0,
          admin: { _id: 1, name: 1, role: 1, photo: 1 },
          today: 1,
          week: 1,
          month: 1,
        },
      },
      { $sort: { month: -1 } },
    ]);

    return res.status(200).json({ success: true, result });
  };

  return methods;
}

module.exports = modelController();
