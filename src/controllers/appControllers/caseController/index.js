const { models, Op, sequelize } = require('@/db');
const createCRUDController = require('@/controllers/middlewaresControllers/createCRUDController');

async function resolveStockEntry(sku, warehouseNickName, transaction) {
  if (!sku || !warehouseNickName) return null;

  const warehouse = await models.Warehouse.findOne({
    where: { nick_name: warehouseNickName, removed: false },
    transaction,
  });
  if (!warehouse) return null;

  const inventory = await models.Inventory.findOne({
    where: { sku, removed: false },
    transaction,
  });
  if (!inventory) return null;

  const [stockRow] = await models.InventoryWarehouseStock.findOrCreate({
    where: { inventory_id: inventory.id, warehouse_id: warehouse.warehouse_id },
    defaults: { inventory_id: inventory.id, warehouse_id: warehouse.warehouse_id, stock: 0, on_the_way: 0 },
    transaction,
  });

  return { inventory, warehouseId: warehouse.warehouse_id, stockRow };
}

async function adjustInventory(sku, warehouseNickName, delta, transaction) {
  const entry = await resolveStockEntry(sku, warehouseNickName, transaction);
  if (!entry || !entry.stockRow) return false;

  const { inventory, stockRow } = entry;
  const current = Number(stockRow.stock) || 0;
  const next = current + Number(delta);
  await stockRow.update({ stock: next }, { transaction });

  const allRows = await models.InventoryWarehouseStock.findAll({
    where: { inventory_id: inventory.id },
    transaction,
  });
  const total = allRows.reduce((sum, r) => sum + (Number(r.stock) || 0), 0);
  await models.Inventory.update(
    { stock_all: total, updated: new Date() },
    { where: { id: inventory.id }, transaction }
  );
  return true;
}

function modelController() {
  const Model = models.Case;
  const methods = createCRUDController('Case');

  const defaultInclude = Object.values(Model.associations || {}).map((assoc) => ({
    model: assoc.target,
    as: assoc.as,
    required: false,
  }));

  methods.create = async (req, res) => {
    const body = { ...req.body };
    body.removed = false;
    if (req.admin?.id) body.createdBy_id = req.admin.id;

    if (body.client && !body.client_id) body.client_id = body.client;
    if (body.sales && !body.sales_id) body.sales_id = body.sales;
    delete body.client;
    delete body.sales;
    delete body.createdBy;

    const created = await Model.create(body);
    const full = await Model.findByPk(created.id, { include: defaultInclude });
    return res.status(200).json({ success: true, result: full, message: 'Successfully Created' });
  };

  methods.update = async (req, res) => {
    const body = { ...req.body };
    body.removed = false;
    body.updated = new Date();
    if (body.client && !body.client_id) body.client_id = body.client;
    if (body.sales && !body.sales_id) body.sales_id = body.sales;
    delete body.client;
    delete body.sales;

    const [count] = await Model.update(body, { where: { id: req.params.id, removed: false } });
    if (!count) return res.status(404).json({ success: false, result: null, message: 'No document found' });
    const result = await Model.findByPk(req.params.id, { include: defaultInclude });
    return res.status(200).json({ success: true, result, message: 'Updated' });
  };

  methods.list = async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.items) || 10;
    const offset = (page - 1) * limit;

    const fieldsArray = req.query.fields ? req.query.fields.split(',') : [];
    const andClauses = [{ removed: false }];

    if (fieldsArray.length > 0) {
      const q = req.query.q || '';
      const directFields = fieldsArray.filter((f) => f !== 'client_name');
      const orClauses = directFields.map((field) => ({ [field]: { [Op.iLike]: `%${q}%` } }));

      if (fieldsArray.includes('client_name') && q) {
        const matchingClients = await models.Client.findAll({
          where: { name: { [Op.iLike]: `%${q}%` }, removed: false },
          attributes: ['id'],
          raw: true,
        });
        if (matchingClients.length > 0) {
          orClauses.push({ client_id: { [Op.in]: matchingClients.map((c) => c.id) } });
        }
      }
      if (orClauses.length > 0) andClauses.push({ [Op.or]: orClauses });
    }

    if (req.query.filter && req.query.equal !== undefined) {
      andClauses.push({ [req.query.filter]: req.query.equal });
    }

    const where = { [Op.and]: andClauses };

    const { rows: result, count } = await Model.findAndCountAll({
      where,
      include: defaultInclude,
      offset,
      limit,
      order: [['created', 'DESC']],
      distinct: true,
    });

    const pages = Math.ceil(count / limit);
    const pagination = { page, pages, count };

    if (count > 0) {
      return res.status(200).json({ success: true, result, pagination, message: 'Found all documents' });
    }
    return res.status(203).json({ success: true, result: [], pagination, message: 'Collection is Empty' });
  };

  // Resolution: Resend — deduct amount from inventory
  methods.resend = async (req, res) => {
    const { id } = req.params;
    const quantity = Number(req.body?.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      return res.status(400).json({ success: false, result: null, message: 'quantity must be a positive number' });
    }

    const caseRow = await Model.findOne({ where: { id, removed: false } });
    if (!caseRow) return res.status(404).json({ success: false, result: null, message: 'No document found' });

    const sku = caseRow.sku;
    const warehouse = req.body?.warehouse || caseRow.warehouse_location;
    if (!sku || !warehouse) {
      return res.status(400).json({ success: false, result: null, message: 'SKU or warehouse is required' });
    }

    await sequelize.transaction(async (t) => {
      const entry = await resolveStockEntry(sku, warehouse, t);
      if (!entry || !entry.stockRow) {
        const err = new Error('Could not resolve inventory/warehouse for this case');
        err.__noStock = true;
        throw err;
      }
      const available = Number(entry.stockRow.stock) || 0;
      if (available < quantity) {
        const err = new Error(`Insufficient stock: only ${available} unit(s) available at ${warehouse}`);
        err.__insufficient = true;
        throw err;
      }
      await adjustInventory(sku, warehouse, -quantity, t);
      await caseRow.update({
        resolution: 'Resend',
        resend_quantity: (Number(caseRow.resend_quantity) || 0) + quantity,
        updated: new Date(),
      }, { transaction: t });
    }).catch((err) => {
      if (err.__insufficient || err.__noStock) {
        return res.status(400).json({ success: false, result: null, message: err.message });
      }
      throw err;
    });

    if (res.headersSent) return;
    const result = await Model.findByPk(id, { include: defaultInclude });
    return res.status(200).json({ success: true, result, message: 'Resend recorded' });
  };

  // Resolution: Return — add stock back to inventory
  methods.return = async (req, res) => {
    const { id } = req.params;
    const rawQty = req.body?.quantity;
    const caseRow = await Model.findOne({ where: { id, removed: false } });
    if (!caseRow) return res.status(404).json({ success: false, result: null, message: 'No document found' });

    const quantity = Number.isFinite(Number(rawQty)) && Number(rawQty) > 0
      ? Number(rawQty)
      : Number(caseRow.quantity) || 0;
    if (quantity <= 0) {
      return res.status(400).json({ success: false, result: null, message: 'quantity must be a positive number' });
    }

    const sku = caseRow.sku;
    const warehouse = req.body?.warehouse || caseRow.warehouse_location;
    if (!sku || !warehouse) {
      return res.status(400).json({ success: false, result: null, message: 'SKU or warehouse is required' });
    }

    await sequelize.transaction(async (t) => {
      const ok = await adjustInventory(sku, warehouse, +quantity, t);
      if (!ok) {
        const err = new Error('Could not resolve inventory/warehouse for this case');
        err.__noStock = true;
        throw err;
      }
      await caseRow.update({
        resolution: 'Return',
        return_quantity: (Number(caseRow.return_quantity) || 0) + quantity,
        updated: new Date(),
      }, { transaction: t });
    }).catch((err) => {
      if (err.__noStock) {
        return res.status(400).json({ success: false, result: null, message: err.message });
      }
      throw err;
    });

    if (res.headersSent) return;
    const result = await Model.findByPk(id, { include: defaultInclude });
    return res.status(200).json({ success: true, result, message: 'Return recorded' });
  };

  // Resolution: Refund — set refund_amount
  methods.refund = async (req, res) => {
    const { id } = req.params;
    const amount = Number(req.body?.amount);
    if (!Number.isFinite(amount) || amount < 0) {
      return res.status(400).json({ success: false, result: null, message: 'amount must be a non-negative number' });
    }

    const caseRow = await Model.findOne({ where: { id, removed: false } });
    if (!caseRow) return res.status(404).json({ success: false, result: null, message: 'No document found' });

    await caseRow.update({
      resolution: 'Refund',
      refund_amount: amount,
      updated: new Date(),
    });

    const result = await Model.findByPk(id, { include: defaultInclude });
    return res.status(200).json({ success: true, result, message: 'Refund recorded' });
  };

  return methods;
}

module.exports = modelController();
