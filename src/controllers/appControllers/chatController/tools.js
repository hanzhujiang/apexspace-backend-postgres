const { tool } = require('@langchain/core/tools');
const { z } = require('zod');
const { models, Op, sequelize } = require('@/db');

const getSalesSummary = tool(
  async ({ status, from, to }) => {
    const Sales = models.Sales;

    const where = { removed: false };
    if (status) where.status = status;
    if (from || to) {
      where.date = {};
      if (from) where.date[Op.gte] = new Date(from);
      if (to) where.date[Op.lte] = new Date(to);
    }

    const results = await Sales.findAll({
      where,
      attributes: [
        'status',
        [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
        [sequelize.fn('SUM', sequelize.col('sale_price_aud')), 'totalRevenue'],
        [sequelize.fn('SUM', sequelize.col('cost_aud')), 'totalCost'],
        [sequelize.fn('SUM', sequelize.col('gross_profit')), 'totalGrossProfit'],
        [sequelize.fn('SUM', sequelize.col('quantity')), 'totalQty'],
      ],
      group: ['status'],
      order: [[sequelize.literal('"totalRevenue"'), 'DESC']],
      raw: true,
    });

    if (results.length === 0) return 'No sales records found for the given filters.';

    return results
      .map(
        (r) =>
          `Status: ${r.status || 'unknown'}, Orders: ${Number(r.count)}, Qty: ${Number(r.totalQty) || 0}, Revenue: $${Number(r.totalRevenue || 0).toFixed(2)} AUD, Cost: $${Number(r.totalCost || 0).toFixed(2)} AUD, Gross Profit: $${Number(r.totalGrossProfit || 0).toFixed(2)} AUD`
      )
      .join('\n');
  },
  {
    name: 'getSalesSummary',
    description:
      'Aggregate sales totals grouped by status. Returns order count, quantity, revenue and cost per status. Optional filters: status (new|pending|won|lost|cancelled), from (ISO date), to (ISO date).',
    schema: z.object({
      status: z
        .enum(['new', 'pending', 'won', 'lost', 'cancelled'])
        .optional()
        .describe('Filter by sales status'),
      from: z.string().optional().describe('Start date filter (ISO 8601)'),
      to: z.string().optional().describe('End date filter (ISO 8601)'),
    }),
  }
);

const getTopSKUs = tool(
  async ({ from, to, limit, sortBy, platform, warehouse_location }) => {
    const Sales = models.Sales;

    const where = { removed: false, sku: { [Op.ne]: '' } };
    if (from || to) {
      where.date = {};
      if (from) where.date[Op.gte] = new Date(from);
      if (to) where.date[Op.lte] = new Date(to);
    }
    if (platform) where.platform = platform;
    if (warehouse_location) where.warehouse_location = warehouse_location;

    const sortField =
      sortBy === 'quantity' ? 'totalQty' : sortBy === 'orders' ? 'orderCount' : 'totalRevenue';

    const results = await Sales.findAll({
      where,
      attributes: [
        'sku',
        [sequelize.fn('MIN', sequelize.col('product_name')), 'productName'],
        [sequelize.fn('SUM', sequelize.col('sale_price_aud')), 'totalRevenue'],
        [sequelize.fn('SUM', sequelize.col('cost_aud')), 'totalCost'],
        [sequelize.fn('SUM', sequelize.col('quantity')), 'totalQty'],
        [sequelize.fn('COUNT', sequelize.col('id')), 'orderCount'],
      ],
      group: ['sku'],
      order: [[sequelize.literal(`"${sortField}"`), 'DESC']],
      limit: limit || 10,
      raw: true,
    });

    if (results.length === 0) return 'No SKU sales data found for the given filters.';

    return results
      .map(
        (r, i) =>
          `${i + 1}. SKU: ${r.sku} (${r.productName || 'unknown'}), Orders: ${Number(r.orderCount)}, Qty: ${Number(r.totalQty) || 0}, Revenue: $${Number(r.totalRevenue || 0).toFixed(2)} AUD, Cost: $${Number(r.totalCost || 0).toFixed(2)} AUD`
      )
      .join('\n');
  },
  {
    name: 'getTopSKUs',
    description:
      'Rank SKUs from the Sales collection by revenue, quantity, or order count. Returns SKU code, product name, order count, quantity, revenue, and cost. Use for any question about best-selling products, top SKUs, or SKU performance.',
    schema: z.object({
      from: z.string().optional().describe('Start date filter (ISO 8601)'),
      to: z.string().optional().describe('End date filter (ISO 8601)'),
      limit: z.number().int().min(1).max(50).optional().describe('Number of SKUs to return (default 10)'),
      sortBy: z.enum(['revenue', 'quantity', 'orders']).optional().describe('Sort by revenue (default), quantity sold, or order count'),
      platform: z.string().optional().describe('Filter by sales platform (e.g. Amazon, Shopify)'),
      warehouse_location: z.string().optional().describe('Filter by warehouse location'),
    }),
  }
);

const getInventory = tool(
  async ({ sku, warehouse, low_stock_only, limit }) => {
    const Inventory = models.Inventory;
    const Warehouse = models.Warehouse;
    const InventoryWarehouseStock = models.InventoryWarehouseStock;

    const where = { removed: false };
    if (sku) where.sku = { [Op.iLike]: `%${sku}%` };
    if (low_stock_only) where.stock_all = { [Op.lte]: 5 };

    const rows = await Inventory.findAll({
      where,
      order: [['stock_all', 'DESC'], ['sku', 'ASC']],
      limit: Math.min(Math.max(limit || 20, 1), 100),
      raw: true,
    });

    if (rows.length === 0) return 'No inventory records found for the given filters.';

    let perWarehouse = {};
    if (warehouse) {
      const wh = await Warehouse.findOne({
        where: { removed: false, [Op.or]: [{ warehouse_id: warehouse }, { nick_name: { [Op.iLike]: warehouse } }] },
        raw: true,
      });
      if (!wh) return `No warehouse found matching "${warehouse}".`;
      const stockRows = await InventoryWarehouseStock.findAll({
        where: {
          warehouse_id: wh.warehouse_id,
          inventory_id: { [Op.in]: rows.map((r) => r.id) },
        },
        raw: true,
      });
      perWarehouse = Object.fromEntries(
        stockRows.map((s) => [s.inventory_id, { stock: s.stock, on_the_way: s.on_the_way }])
      );
      return rows
        .map((r) => {
          const w = perWarehouse[r.id] || { stock: 0, on_the_way: 0 };
          return `SKU: ${r.sku}, Warehouse ${wh.nick_name}: stock=${w.stock}, on_the_way=${w.on_the_way}, Total across warehouses=${r.stock_all}`;
        })
        .join('\n');
    }

    return rows
      .map((r) => `SKU: ${r.sku}, Total Stock (all warehouses): ${r.stock_all}`)
      .join('\n');
  },
  {
    name: 'getInventory',
    description:
      'Fetch current inventory levels. Returns total stock across all warehouses per SKU, or per-warehouse stock + in-transit (on_the_way) when a warehouse is specified. Use for stock checks, low-stock questions, or warehouse comparisons.',
    schema: z.object({
      sku: z.string().optional().describe('Filter by SKU (partial match, case-insensitive)'),
      warehouse: z.string().optional().describe('Warehouse nickname or warehouse_id for per-warehouse breakdown'),
      low_stock_only: z.boolean().optional().describe('Return only SKUs with stock <= 5'),
      limit: z.number().int().min(1).max(100).optional().describe('Max rows to return (default 20)'),
    }),
  }
);

const getProducts = tool(
  async ({ sku, name, limit }) => {
    const Product = models.Product;
    const where = { removed: false };
    if (sku) where.sku = { [Op.iLike]: `%${sku}%` };
    if (name) where.product_name = { [Op.iLike]: `%${name}%` };

    const rows = await Product.findAll({
      where,
      limit: Math.min(Math.max(limit || 15, 1), 50),
      order: [['sku', 'ASC']],
      attributes: ['sku', 'product_name', 'package_weight', 'package_length', 'package_width', 'package_height', 'container_40_qty', 'procurement_price', 'factory'],
      raw: true,
    });

    if (rows.length === 0) return 'No products found for the given filters.';

    return rows
      .map((r) => {
        const dims = [r.package_length, r.package_width, r.package_height].filter((v) => v != null);
        const dimStr = dims.length === 3 ? `${dims.join('×')} cm` : '-';
        return `SKU: ${r.sku}, Name: ${r.product_name}, Weight: ${r.package_weight ?? '-'} kg, Dims: ${dimStr}, 40ft Qty: ${r.container_40_qty ?? '-'}, Procurement: $${r.procurement_price ?? '-'}, Factory: ${r.factory || '-'}`;
      })
      .join('\n');
  },
  {
    name: 'getProducts',
    description:
      'Look up product catalog metadata (name, packaging dimensions and weight, 40ft container quantity, procurement price, factory). Use when the user asks about product details, shipping specs, or factory source.',
    schema: z.object({
      sku: z.string().optional().describe('Filter by SKU (partial, case-insensitive)'),
      name: z.string().optional().describe('Filter by product name (partial, case-insensitive)'),
      limit: z.number().int().min(1).max(50).optional().describe('Max rows (default 15)'),
    }),
  }
);

const getPlatforms = tool(
  async ({ enabled_only }) => {
    const Platform = models.Platform;
    const where = { removed: false };
    if (enabled_only !== false) where.enabled = true;

    const rows = await Platform.findAll({
      where,
      order: [['sort_order', 'ASC'], ['id', 'ASC']],
      attributes: ['name', 'enabled', 'fee_rate', 'fee_fixed', 'monthly_fee'],
      raw: true,
    });

    if (rows.length === 0) return 'No platforms found.';

    return rows
      .map(
        (r) =>
          `${r.name} (${r.enabled ? 'enabled' : 'disabled'}): fee_rate=${r.fee_rate}, fee_fixed=$${r.fee_fixed}, monthly_fee=$${r.monthly_fee}`
      )
      .join('\n');
  },
  {
    name: 'getPlatforms',
    description:
      'List configured sales platforms (Amazon, eBay, Kogan, etc.) from Shop Settings with their fee rates and monthly fees. Use when the user asks which platforms are active, their fees, or to validate a platform name before filtering sales data.',
    schema: z.object({
      enabled_only: z.boolean().optional().describe('If false, include disabled platforms (default true)'),
    }),
  }
);

const getSkuCosts = tool(
  async ({ sku, at_date, limit }) => {
    const ProductCosts = models.ProductCosts;
    const where = { removed: false };
    if (sku) where.sku = { [Op.iLike]: `%${sku}%` };
    if (at_date) {
      const d = at_date;
      where.date_from = { [Op.lte]: d };
      where[Op.and] = [
        { [Op.or]: [{ date_to: null }, { date_to: { [Op.gte]: d } }] },
      ];
    }

    const rows = await ProductCosts.findAll({
      where,
      order: [['sku', 'ASC'], ['date_from', 'DESC']],
      limit: Math.min(Math.max(limit || 20, 1), 100),
      attributes: ['sku', 'cost', 'date_from', 'date_to'],
      raw: true,
    });

    if (rows.length === 0) return 'No SKU cost records found for the given filters.';

    return rows
      .map(
        (r) =>
          `SKU: ${r.sku}, Cost: $${Number(r.cost).toFixed(2)}, Valid: ${r.date_from || '-'} → ${r.date_to || 'current'}`
      )
      .join('\n');
  },
  {
    name: 'getSkuCosts',
    description:
      'Fetch per-SKU cost history (from Product Costs). Each row has a cost and a valid-from/valid-to date window. Use for cost lookups, cost changes over time, or to find the cost active on a specific date.',
    schema: z.object({
      sku: z.string().optional().describe('Filter by SKU (partial, case-insensitive)'),
      at_date: z.string().optional().describe('Return only the cost active on this date (YYYY-MM-DD)'),
      limit: z.number().int().min(1).max(100).optional().describe('Max rows (default 20)'),
    }),
  }
);

const getCustomers = tool(
  async ({ name, country, limit }) => {
    const Client = models.Client;
    const where = { removed: false };
    if (name) where.name = { [Op.iLike]: `%${name}%` };
    if (country) where.country = { [Op.iLike]: `%${country}%` };

    const rows = await Client.findAll({
      where,
      limit: Math.min(Math.max(limit || 20, 1), 100),
      order: [['name', 'ASC']],
      attributes: ['id', 'name', 'country', 'address', 'email', 'phone'],
      raw: true,
    });

    if (rows.length === 0) return 'No customers found for the given filters.';

    // Build region/country summary alongside the list — helps answer
    // questions like "what % of customers are in NSW?".
    const byCountry = {};
    for (const r of rows) {
      const k = r.country || 'Unknown';
      byCountry[k] = (byCountry[k] || 0) + 1;
    }
    const summary = Object.entries(byCountry)
      .map(([c, n]) => `${c}: ${n}`)
      .join(', ');

    const list = rows
      .map(
        (r) =>
          `ID: ${r.id}, Name: ${r.name}, Country: ${r.country || '-'}, Address: ${r.address || '-'}, Email: ${r.email || '-'}, Phone: ${r.phone || '-'}`
      )
      .join('\n');

    return `By country: ${summary}\n\n${list}`;
  },
  {
    name: 'getCustomers',
    description:
      'Look up customers (clients). Returns id, name, country, address, email, and phone, plus a by-country count summary. Use for customer counts, regional distribution, or to find a customer before cross-referencing sales.',
    schema: z.object({
      name: z.string().optional().describe('Filter by customer name (partial, case-insensitive)'),
      country: z.string().optional().describe('Filter by country (partial, case-insensitive). Can be a state/region string if addresses include it.'),
      limit: z.number().int().min(1).max(100).optional().describe('Max rows (default 20)'),
    }),
  }
);

module.exports = {
  getSalesSummary,
  getTopSKUs,
  getInventory,
  getProducts,
  getPlatforms,
  getSkuCosts,
  getCustomers,
};
