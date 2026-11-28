const { models, Op, sequelize } = require('@/db');
const createCRUDController = require('@/controllers/middlewaresControllers/createCRUDController');
const moment = require('moment-timezone');
const { startOfDayUtc, endOfDayUtc, FALLBACK_TZ } = require('@/utils/dateTime');
const monthlyPnl = require('@/controllers/appControllers/monthlyPnlController');

// Fire-and-await Monthly P&L recompute for each month touched by a sale
// mutation. Uses `date || created` so sales without an explicit order date
// still land in a month.
async function refreshPnlForSales(...dates) {
  const keys = new Set();
  for (const d of dates) {
    const key = monthlyPnl.monthKeyFromDate(d);
    if (key) keys.add(`${key.year}-${key.month}`);
  }
  for (const k of keys) {
    const [y, m] = k.split('-').map(Number);
    await monthlyPnl.recomputeMonthlyPnl(y, m);
  }
}

// Look up the SKU's per-unit cost from ProductCosts for a given sale date.
// Picks the most recent window whose date_from <= saleDate and (date_to is null
// OR date_to >= saleDate). Returns null if nothing matches.
async function lookupSkuCostAt(sku, saleDate, transaction) {
  if (!sku) return null;
  const entries = await models.ProductCosts.findAll({
    where: { sku, removed: false },
    raw: true,
    transaction,
  });
  if (!entries.length) return null;
  const d = saleDate ? new Date(saleDate) : new Date();
  const match = entries
    .filter(
      (e) =>
        new Date(e.date_from) <= d &&
        (e.date_to == null || new Date(e.date_to) >= d)
    )
    .sort((a, b) => new Date(b.date_from) - new Date(a.date_from))[0];
  return match ? Number(match.cost) : null;
}

// sales.cost_aud is the authoritative total cost for the row — set on create
// from (ProductCosts.cost × quantity) and edited directly thereafter. Read
// endpoints return it as stored; no overlay.

// Compute gross_profit for a sale row using the current platform fee config.
// Formula mirrors monthlyPnlController:
//   gp = (sale + ship_price) * fee_rate - fee_fixed - ship_cost - cost_aud
// cost_aud is total cost for the row (no multiplication by quantity).
// Returns 0 when the sale has no matching platform (so the row still has a
// numeric value instead of leaving stale data).
async function computeGrossProfit(saleFields, transaction) {
  const num = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };
  const platformName = String(saleFields.platform || '').trim();
  if (!platformName) return 0;

  const platform = await models.Platform.findOne({
    where: sequelize.where(
      sequelize.fn('LOWER', sequelize.col('name')),
      platformName.toLowerCase()
    ),
    transaction,
  });
  if (!platform) return 0;

  const rate = num(platform.fee_rate);
  if (rate === 0) return 0;

  const sale = num(saleFields.sale_price_aud);
  const shipPrice = num(saleFields.shipping_price_aud);
  const shipCost = num(saleFields.shipping_cost_aud);
  const cost = num(saleFields.cost_aud);
  const fixed = num(platform.fee_fixed);

  return (sale + shipPrice) * rate - fixed - shipCost - cost;
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
  if (req.query.unfulfilled === 'true') {
    andClauses.push({ [Op.or]: [{ shipping_no: null }, { shipping_no: '' }] });
  }
  if (req.query.date_from || req.query.date_to) {
    const dateRange = {};
    if (req.query.date_from) dateRange[Op.gte] = startOfDayUtc(req.query.date_from, req.userTz);
    if (req.query.date_to) dateRange[Op.lte] = endOfDayUtc(req.query.date_to, req.userTz);
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
    order: [[sequelize.literal('"Sales"."date" DESC NULLS LAST')], ['id', 'DESC']],
    distinct: true,
  });

  const result = rawResult.map((r) => (typeof r.toJSON === 'function' ? r.toJSON() : r));
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

        // cost_aud stores TOTAL cost for the row. If the client didn't supply
        // one, derive it from the current SKU cost (ProductCosts window) × qty.
        // If the client did supply cost_aud, trust it — the edit form sends the
        // total value directly.
        const costProvided = body.cost_aud !== undefined && body.cost_aud !== null && body.cost_aud !== '';
        if (!costProvided && sku && Number(quantity) > 0) {
          const unitCost = await lookupSkuCostAt(sku, body.date, t);
          if (unitCost != null) {
            body.cost_aud = unitCost * Number(quantity);
          }
        }

        // Persist gross_profit so dashboard aggregations don't have to join
        // platform fees at read time.
        body.gross_profit = await computeGrossProfit(body, t);

        const created = await Model.create(body, { transaction: t });
        await deductInventory(sku, warehouse_location, quantity, t);
        return created;
      });

      await refreshPnlForSales(result.date || result.created);

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

  // Wrap the default CRUD update / delete to trigger a P&L recompute after
  // each successful write. For update, we fetch the row's pre-change date so
  // we can refresh both the old and new month when the date moves.
  const baseUpdate = methods.update;
  methods.update = async (req, res) => {
    const before = await Model.findOne({
      where: { id: req.params.id },
      attributes: ['id', 'date'],
      raw: true,
    });
    await baseUpdate(req, res);

    // Recompute gross_profit from the post-write row — any of cost_aud,
    // sale_price_aud, shipping_price_aud, shipping_cost_aud, or platform may
    // have changed, so the cheapest/most reliable path is to read back + save.
    const after = await Model.findOne({ where: { id: req.params.id }, raw: true });
    if (after) {
      const gp = await computeGrossProfit(after);
      if (Number(after.gross_profit) !== gp) {
        await Model.update({ gross_profit: gp }, { where: { id: req.params.id } });
      }
    }

    await refreshPnlForSales(before?.date, after?.date);
  };

  const baseDelete = methods.delete;
  methods.delete = async (req, res) => {
    const before = await Model.findOne({
      where: { id: req.params.id },
      attributes: ['id', 'date'],
      raw: true,
    });
    await baseDelete(req, res);
    await refreshPnlForSales(before?.date);
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
    return res.status(200).json({ success: true, result: sale, message: 'we found this document' });
  };

  methods.recentChart = async (req, res) => {
    const days = Math.min(parseInt(req.query.days) || 7, 90);
    const tz = req.userTz || FALLBACK_TZ;
    const now = new Date();
    const from = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

    const platformRows = await models.Platform.findAll({
      where: { removed: false, enabled: true },
      order: [['sort_order', 'ASC'], ['id', 'ASC']],
      attributes: ['name'],
    });
    const platforms = platformRows.map((p) => p.name);

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
      for (const p of platforms) dataMap[date][p] = 0;
    }
    for (const row of raw) {
      const date = row.day;
      if (!dataMap[date]) continue;
      const key = platforms.find((p) => p.toLowerCase() === (row.platform || '').toLowerCase());
      if (key) dataMap[date][key] += Number(row.qty) || 0;
    }

    const chartData = dates.map((date) => {
      const entry = { date: date.slice(5).replace('-', '/') }; // MM/DD
      let total = 0;
      for (const p of platforms) {
        entry[p] = dataMap[date][p];
        total += entry[p];
      }
      entry.total = total;
      return entry;
    });

    return res.status(200).json({ success: true, result: { chartData, platforms } });
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

  methods.skuGrossProfit = async (req, res) => {
    // Per-SKU gross profit over the last N days (N ∈ {7,15,30}). Returns the
    // total gross profit, per-order average, and profit rate (GP ÷ SKU cost).
    // `platform` is a case-insensitive filter against sales.platform; absent or
    // 'all' means every platform. Caller may pass all=true to lift the top-20
    // limit (used by a "Show all" modal).
    const daysRaw = parseInt(req.query.days) || 7;
    const days = [7, 15, 30].includes(daysRaw) ? daysRaw : 7;
    const platform = (req.query.platform || '').trim();
    const showAll = req.query.all === 'true' || req.query.all === '1';
    const limitClause = showAll ? '' : 'LIMIT 20';
    const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const whereParts = [
      'removed = false',
      'sku IS NOT NULL',
      "sku <> ''",
      'date >= :from',
    ];
    const replacements = { from };
    if (platform && platform.toLowerCase() !== 'all') {
      whereParts.push('LOWER(platform) = LOWER(:platform)');
      replacements.platform = platform;
    }

    // Per-unit average: sum(gross_profit) ÷ sum(quantity).
    // Per-unit average rate: avg GP ÷ avg per-unit cost = sum(gp) ÷ sum(cost_aud).
    // cost_aud is stored as total cost for the row.
    const sql = `
      SELECT sku,
             MIN(product_name) AS product_name,
             COUNT(*)::int AS "orderCount",
             SUM(quantity)::int AS "totalQty",
             SUM(gross_profit)::float AS "totalGrossProfit",
             SUM(cost_aud)::float AS "totalCost"
      FROM sales
      WHERE ${whereParts.join(' AND ')}
      GROUP BY sku
      ORDER BY (SUM(gross_profit) / NULLIF(SUM(quantity), 0)) DESC NULLS LAST
      ${limitClause}
    `;

    const rows = await sequelize.query(sql, {
      replacements,
      type: sequelize.QueryTypes.SELECT,
    });

    const result = rows.map((r) => {
      const totalGp = Number(r.totalGrossProfit) || 0;
      const totalCost = Number(r.totalCost) || 0;
      const totalQty = Number(r.totalQty) || 0;
      const avgGrossProfit = totalQty > 0 ? totalGp / totalQty : 0;
      const avgUnitCost = totalQty > 0 ? totalCost / totalQty : 0;
      return {
        sku: r.sku,
        product_name: r.product_name,
        orderCount: Number(r.orderCount) || 0,
        totalQty,
        avgGrossProfit,
        totalGrossProfit: totalGp,
        totalCost,
        avgUnitCost,
        // avgGrossProfit / avgUnitCost ≡ SUM(gp) / SUM(cost_aud)
        grossProfitRate: avgUnitCost > 0 ? avgGrossProfit / avgUnitCost : 0,
      };
    });

    const platformRows = await models.Platform.findAll({
      where: { removed: false, enabled: true },
      order: [['sort_order', 'ASC'], ['id', 'ASC']],
      attributes: ['name'],
    });
    const platforms = platformRows.map((p) => p.name);
    return res.status(200).json({ success: true, result: { rows: result, platforms, days } });
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
    const weekStart = nowLocal.clone().startOf('isoWeek').utc().toDate(); // Monday
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
