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

module.exports = { getSalesSummary, getTopSKUs };
