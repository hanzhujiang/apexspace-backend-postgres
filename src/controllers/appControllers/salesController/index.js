const { models, Op, sequelize } = require('@/db');
const createCRUDController = require('@/controllers/middlewaresControllers/createCRUDController');
const moment = require('moment-timezone');
const { startOfDayUtc, endOfDayUtc, FALLBACK_TZ } = require('@/utils/dateTime');

// Overlay point-in-time cost_aud onto each sales row from ProductCosts (SKU + date window).
// Does NOT mutate the sales table.
async function enrichWithSkuCosts(sales) {
  if (!sales.length) return sales;

  const ProductCosts = models.ProductCosts;
  const skus = [...new Set(sales.map((s) => s.sku).filter(Boolean))];
  const toPlain = (s) => (typeof s.toJSON === 'function' ? s.toJSON() : { ...s });

  if (!skus.length) return sales.map(toPlain);

  const costEntries = await ProductCosts.findAll({
    where: { sku: { [Op.in]: skus }, removed: false },
    raw: true,
  });

  return sales.map((sale) => {
    const plain = toPlain(sale);
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

    // Prefer ProductCosts overlay (point-in-time). Fall back to the sale's
    // stored cost_aud (set at import time by koganUpload etc.) so rows without
    // a matching ProductCosts window still show the imported cost instead of
    // blanking out. 0 is treated as "unknown" and shown as blank.
    if (match) {
      plain.cost_aud = match.cost;
    } else {
      const stored = Number(plain.cost_aud);
      plain.cost_aud = stored > 0 ? stored : null;
    }
    return plain;
  });
}

async function salesList(Model, req, res) {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.items) || 10;
  const offset = page * limit - limit;

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
  if (req.query.date_from || req.query.date_to) {
    const dateRange = {};
    if (req.query.date_from) dateRange[Op.gte] = startOfDayUtc(req.query.date_from, req.userTz);
    if (req.query.date_to)   dateRange[Op.lte] = endOfDayUtc(req.query.date_to, req.userTz);
    andClauses.push({ date: dateRange });
  }

  const where = { [Op.and]: andClauses };

  const defaultInclude = Object.values(Model.associations || {}).map((assoc) => ({
    model: assoc.target,
    as: assoc.as,
    required: false,
  }));

  const { rows: rawResult, count } = await Model.findAndCountAll({
    where,
    include: defaultInclude,
    offset,
    limit,
    order: [['shipping_no', 'ASC'], ['date', 'DESC']],
    distinct: true,
  });

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
  }
  return res.status(203).json({
    success: true,
    result: [],
    pagination,
    message: 'Collection is Empty',
  });
}

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

  const stockRow = await models.InventoryWarehouseStock.findOne({
    where: { inventory_id: inventory.id, warehouse_id: warehouse.warehouse_id },
    transaction,
  });

  return { inventory, warehouseId: warehouse.warehouse_id, stockRow };
}

async function deductInventory(sku, warehouseNickName, quantity, transaction) {
  const entry = await resolveStockEntry(sku, warehouseNickName, transaction);
  if (!entry || !entry.stockRow) return;

  const { inventory, stockRow } = entry;
  const current = Number(stockRow.stock) || 0;
  await stockRow.update({ stock: current - Number(quantity) }, { transaction });

  const allRows = await models.InventoryWarehouseStock.findAll({
    where: { inventory_id: inventory.id },
    transaction,
  });
  const total = allRows.reduce((sum, r) => sum + (Number(r.stock) || 0), 0);
  await models.Inventory.update(
    { stock_all: total, updated: new Date() },
    { where: { id: inventory.id }, transaction }
  );
}

function modelController() {
  const Model = models.Sales;
  const methods = createCRUDController('Sales');

  methods.create = async (req, res) => {
    const body = { ...req.body };
    body.createdBy_id = req.admin.id;
    body.removed = false;

    const { sku, warehouse_location, quantity } = body;

    // cost_aud: ProductCosts overlays this value at read time when a matching
    // SKU+date window exists; otherwise the stored value is shown. We keep
    // whatever the client sent (or 0 default) so manual sales can carry cost.
    // Strip Mongoose-style foreign key names if client sent them
    if (body.client && !body.client_id) {
      body.client_id = body.client;
    }
    delete body.client;
    delete body.createdBy;

    try {
      const result = await sequelize.transaction(async (t) => {
        if (sku && warehouse_location && quantity) {
          const entry = await resolveStockEntry(sku, warehouse_location, t);
          if (entry && entry.stockRow) {
            const available = Number(entry.stockRow.stock) || 0;
            if (available < Number(quantity)) {
              const err = new Error(
                `Insufficient stock: only ${available} unit(s) available for this SKU at the selected warehouse.`
              );
              err.__insufficientStock = true;
              err.__available = available;
              throw err;
            }
          }
        }

        const created = await Model.create(body, { transaction: t });
        await deductInventory(sku, warehouse_location, quantity, t);
        return created;
      });

      return res.status(200).json({
        success: true,
        result,
        message: 'Successfully Created the document in Model',
      });
    } catch (err) {
      if (err.__insufficientStock) {
        return res.status(400).json({ success: false, result: null, message: err.message });
      }
      throw err;
    }
  };

  methods.list = (req, res) => salesList(Model, req, res);

  methods.read = async (req, res) => {
    const defaultInclude = Object.values(Model.associations || {}).map((assoc) => ({
      model: assoc.target,
      as: assoc.as,
      required: false,
    }));
    const sale = await Model.findOne({
      where: { id: req.params.id, removed: false },
      include: defaultInclude,
    });
    if (!sale) {
      return res.status(404).json({ success: false, result: null, message: 'No document found' });
    }
    const [enriched] = await enrichWithSkuCosts([sale]);
    return res.status(200).json({ success: true, result: enriched, message: 'we found this document' });
  };

  methods.recentChart = async (req, res) => {
    const days = Math.min(parseInt(req.query.days) || 7, 90);
    const tz = req.userTz || FALLBACK_TZ;
    const now = new Date();
    const from = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

    const PLATFORMS = ['MyDeal', 'Amazon', 'Kogan', 'Bunnings', 'Shopify'];

    // `sales.date` is TIMESTAMP WITH TIME ZONE. A single `AT TIME ZONE :tz`
    // converts the stored UTC instant to the user's wall clock (naive). The
    // older code chained `AT TIME ZONE 'UTC' AT TIME ZONE :tz` which is only
    // correct for naive timestamps — on timestamptz it offsets the result by
    // the zone and drops rows onto the wrong calendar day.
    const sql = `
      SELECT TO_CHAR(date AT TIME ZONE :tz, 'YYYY-MM-DD') AS day,
             platform,
             SUM(quantity)::int AS qty
      FROM sales
      WHERE removed = false AND date >= :from AND date <= :now
      GROUP BY day, platform
      ORDER BY day ASC
    `;

    const raw = await sequelize.query(sql, {
      replacements: { tz, from, now },
      type: sequelize.QueryTypes.SELECT,
    });

    // Build date range in user's local timezone (oldest → newest)
    const toLocalDate = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(d);
    const dates = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      dates.push(toLocalDate(d));
    }

    const dataMap = {};
    for (const date of dates) {
      dataMap[date] = {};
      for (const p of PLATFORMS) dataMap[date][p] = 0;
    }
    for (const row of raw) {
      const date = row.day;
      if (!dataMap[date]) continue;
      const key = PLATFORMS.find((p) => p.toLowerCase() === (row.platform || '').toLowerCase());
      if (key) dataMap[date][key] += Number(row.qty) || 0;
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
    const showAll = req.query.all === 'true' || req.query.all === '1';
    const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const limitClause = showAll ? '' : 'LIMIT 10';
    const sql = `
      SELECT sku,
             MIN(product_name) AS product_name,
             SUM(quantity)::int AS "totalQty"
      FROM sales
      WHERE removed = false
        AND sku IS NOT NULL
        AND sku <> ''
        AND date >= :from
      GROUP BY sku
      ORDER BY "totalQty" DESC
      ${limitClause}
    `;

    const result = await sequelize.query(sql, {
      replacements: { from },
      type: sequelize.QueryTypes.SELECT,
    });

    return res.status(200).json({ success: true, result });
  };

  methods.staleSkus = async (req, res) => {
    const days = Math.min(parseInt(req.query.days) || 30, 365);
    const showAll = req.query.all === 'true' || req.query.all === '1';
    const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const limitClause = showAll ? '' : 'LIMIT 20';
    const sql = `
      SELECT i.sku,
             i.stock_all::int AS "stockAll",
             (
               SELECT MIN(s.product_name)
               FROM sales s
               WHERE s.sku = i.sku AND s.removed = false AND s.product_name IS NOT NULL
             ) AS product_name
      FROM inventories i
      WHERE i.removed = false
        AND i.stock_all > 0
        AND NOT EXISTS (
          SELECT 1 FROM sales s
          WHERE s.sku = i.sku
            AND s.removed = false
            AND s.date >= :from
        )
      ORDER BY "stockAll" DESC, i.sku ASC
      ${limitClause}
    `;

    const result = await sequelize.query(sql, {
      replacements: { from },
      type: sequelize.QueryTypes.SELECT,
    });

    return res.status(200).json({ success: true, result });
  };

  methods.employeePerformance = async (req, res) => {
    // Day/week/month boundaries are anchored in the acting user's timezone so
    // "today" and "this month" always match what they see on the client.
    const tz = req.userTz || FALLBACK_TZ;
    const nowLocal = moment.tz(tz);
    const todayStart = nowLocal.clone().startOf('day').utc().toDate();
    const weekStart  = nowLocal.clone().startOf('isoWeek').utc().toDate(); // Monday
    const monthStart = nowLocal.clone().startOf('month').utc().toDate();

    const sql = `
      SELECT a.id,
             a.name,
             a.role,
             a.photo,
             COUNT(*) FILTER (WHERE s.date >= :todayStart)::int AS today,
             COUNT(*) FILTER (WHERE s.date >= :weekStart)::int  AS week,
             COUNT(*)::int AS month
      FROM sales s
      INNER JOIN admins a ON a.id = s."createdBy_id"
      WHERE s.removed = false AND s.date >= :monthStart
      GROUP BY a.id, a.name, a.role, a.photo
      ORDER BY month DESC
    `;

    const rows = await sequelize.query(sql, {
      replacements: { todayStart, weekStart, monthStart },
      type: sequelize.QueryTypes.SELECT,
    });

    // Preserve the Mongoose response shape: { admin: {...}, today, week, month }
    const result = rows.map((r) => ({
      admin: { _id: r.id, id: r.id, name: r.name, role: r.role, photo: r.photo },
      today: Number(r.today) || 0,
      week: Number(r.week) || 0,
      month: Number(r.month) || 0,
    }));

    return res.status(200).json({ success: true, result });
  };

  return methods;
}

module.exports = modelController();
