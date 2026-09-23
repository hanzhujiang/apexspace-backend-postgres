const { tool } = require('@langchain/core/tools');
const { z } = require('zod');
const mongoose = require('mongoose');

const getSalesSummary = tool(
  async ({ status, from, to }) => {
    const Sales = mongoose.model('Sales');

    const match = { removed: { $ne: true } };
    if (status) match.status = status;
    if (from || to) {
      match.date = {};
      if (from) match.date.$gte = new Date(from);
      if (to) match.date.$lte = new Date(to);
    }

    const results = await Sales.aggregate([
      { $match: match },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalAmount: { $sum: '$amount' },
          totalRevenue: { $sum: '$sale_price_aud' },
          totalCost: { $sum: '$cost_aud' },
          totalQty: { $sum: '$quantity' },
          currency: { $first: '$currency' },
        },
      },
      { $sort: { totalRevenue: -1 } },
    ]);

    if (results.length === 0) return 'No sales records found for the given filters.';

    return results
      .map(
        (r) =>
          `Status: ${r._id || 'unknown'}, Orders: ${r.count}, Qty: ${r.totalQty}, Revenue: $${r.totalRevenue.toFixed(2)} AUD, Cost: $${r.totalCost.toFixed(2)} AUD`
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
  async ({ from, to, limit, sortBy, platform, warehouse }) => {
    const Sales = mongoose.model('Sales');

    const match = { removed: { $ne: true }, sku: { $exists: true, $ne: '' } };
    if (from || to) {
      match.date = {};
      if (from) match.date.$gte = new Date(from);
      if (to) match.date.$lte = new Date(to);
    }
    if (platform) match.platform = platform;
    if (warehouse) match.warehouse = warehouse;

    const sortField = sortBy === 'quantity' ? 'totalQty' : sortBy === 'orders' ? 'orderCount' : 'totalRevenue';

    const results = await Sales.aggregate([
      { $match: match },
      {
        $group: {
          _id: '$sku',
          productName: { $first: '$product_name' },
          totalRevenue: { $sum: '$sale_price_aud' },
          totalCost: { $sum: '$cost_aud' },
          totalQty: { $sum: '$quantity' },
          orderCount: { $sum: 1 },
        },
      },
      { $sort: { [sortField]: -1 } },
      { $limit: limit || 10 },
    ]);

    if (results.length === 0) return 'No SKU sales data found for the given filters.';

    return results
      .map(
        (r, i) =>
          `${i + 1}. SKU: ${r._id} (${r.productName || 'unknown'}), Orders: ${r.orderCount}, Qty: ${r.totalQty}, Revenue: $${r.totalRevenue.toFixed(2)} AUD, Cost: $${r.totalCost.toFixed(2)} AUD`
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
      warehouse: z.string().optional().describe('Filter by warehouse'),
    }),
  }
);

module.exports = { getSalesSummary, getTopSKUs };
