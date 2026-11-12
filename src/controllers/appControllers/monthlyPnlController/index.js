const { models, Op } = require('@/db');

/**
 * Monthly P&L controller.
 *
 * Endpoints:
 *   GET   /monthly-pnl?year=&month=            → live P&L (also upserts a snapshot row)
 *   PATCH /monthly-pnl/ads?year=&month=&platform_id=
 *     body: { amount }                         → upsert ads_spend row
 *
 * Formula owner-notes:
 *   revenue        = SUM(sale_price_aud + shipping_price_aud) for sales in month
 *   cost_of_goods  = SUM(cost_aud * quantity)
 *   shipping_cost  = SUM(shipping_cost_aud)
 *   gross_profit   = SUM((sale + ship_price) * platform.fee_rate - platform.fee_fixed
 *                        - ship_cost - cost_aud * qty)
 *   loss           = SUM over cases resolved in month of
 *                      refund_amount + (resend_qty + return_qty) * sales.cost_aud
 *   ads_cost       = ads_spend row for (year, month, platform_id IS NULL)
 *   platform_fees  = SUM(platforms.monthly_fee) for enabled, non-removed platforms
 *   tax            = max((revenue - cost_of_goods - shipping_cost) * 0.1, 0)
 *   net_profit     = gross_profit - ads_cost - platform_fees - labor_cost
 *                    - warehouse_cost - loss   (tax intentionally NOT subtracted)
 */

function monthRangeUtc(year, month) {
  // Month is 1-12. UTC-anchored boundaries.
  const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));
  return { start, end };
}

function toNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function ratio(numerator, denominator) {
  if (!denominator || denominator <= 0) return 0;
  return numerator / denominator;
}

async function computePnl(year, month) {
  const { start, end } = monthRangeUtc(year, month);

  const [sales, platforms, adsRow, caseRows] = await Promise.all([
    models.Sales.findAll({
      where: {
        removed: false,
        date: { [Op.gte]: start, [Op.lt]: end },
      },
      raw: true,
    }),
    models.Platform.findAll({ where: { removed: false }, raw: true }),
    models.AdsSpend.findOne({
      where: { removed: false, year, month, platform_id: null },
      raw: true,
    }),
    models.Case.findAll({
      where: {
        removed: false,
        updated: { [Op.gte]: start, [Op.lt]: end },
      },
      raw: true,
    }),
  ]);

  const platformByName = new Map();
  for (const p of platforms) {
    platformByName.set(String(p.name || '').toLowerCase(), p);
  }

  let revenue = 0;
  let costOfGoods = 0;
  let shippingCost = 0;
  let grossProfit = 0;

  for (const s of sales) {
    const sale = toNum(s.sale_price_aud);
    const shipPrice = toNum(s.shipping_price_aud);
    const shipCost = toNum(s.shipping_cost_aud);
    const cost = toNum(s.cost_aud);
    const qty = toNum(s.quantity);

    revenue += sale + shipPrice;
    costOfGoods += cost * qty;
    shippingCost += shipCost;

    // Mirrors calcGrossProfit() in apexspace-frontend-next/src/app/(erp)/sales/page.tsx
    const cfg = platformByName.get(String(s.platform || '').toLowerCase());
    if (cfg) {
      const rate = toNum(cfg.fee_rate);
      const fixed = toNum(cfg.fee_fixed);
      if (rate !== 0) {
        grossProfit += (sale + shipPrice) * rate - fixed - shipCost - cost * qty;
      }
    }
  }

  // Loss: refunds + unit cost of resends/returns, using the linked sale's cost_aud.
  const saleIds = [...new Set(caseRows.map((c) => c.sales_id).filter(Boolean))];
  const linkedSales = saleIds.length
    ? await models.Sales.findAll({
        where: { id: { [Op.in]: saleIds } },
        attributes: ['id', 'cost_aud'],
        raw: true,
      })
    : [];
  const costBySaleId = new Map(linkedSales.map((s) => [s.id, toNum(s.cost_aud)]));

  let loss = 0;
  for (const c of caseRows) {
    const unitCost = costBySaleId.get(c.sales_id) || 0;
    loss +=
      toNum(c.refund_amount) +
      toNum(c.resend_quantity) * unitCost +
      toNum(c.return_quantity) * unitCost;
  }

  const adsCost = adsRow ? toNum(adsRow.amount) : 0;

  const platformFees = platforms
    .filter((p) => p.enabled && !p.removed)
    .reduce((sum, p) => sum + toNum(p.monthly_fee), 0);

  const laborCost = 0; // TODO: wire up when labor tracking exists
  const warehouseCost = 0; // TODO: wire up when warehouse cost tracking exists

  const tax = Math.max((revenue - costOfGoods - shippingCost) * 0.1, 0);

  const netProfit =
    grossProfit - adsCost - platformFees - laborCost - warehouseCost - loss;

  const grossMargin = ratio(grossProfit, revenue);
  const netMargin = ratio(netProfit, revenue);

  return {
    year,
    month,
    revenue,
    cost_of_goods: costOfGoods,
    shipping_cost: shippingCost,
    gross_profit: grossProfit,
    gross_margin: grossMargin,
    ads_cost: adsCost,
    platform_fees: platformFees,
    labor_cost: laborCost,
    warehouse_cost: warehouseCost,
    loss,
    tax,
    net_profit: netProfit,
    net_margin: netMargin,
  };
}

/**
 * Compute + persist the P&L for (year, month). Safe to call from write hooks
 * (sales CUD, case resolution, ads/platform updates). Swallow-logs failures so
 * a failed recompute never rolls back the originating write.
 */
async function recomputeMonthlyPnl(year, month) {
  if (!year || !month || month < 1 || month > 12) return null;
  try {
    const result = await computePnl(year, month);
    const [row] = await models.MonthlySalesSummary.findOrCreate({
      where: { year, month },
      defaults: { ...result, created: new Date(), updated: new Date() },
    });
    await row.update({ ...result, updated: new Date() });
    return result;
  } catch (err) {
    console.error(`[monthlyPnl] recompute failed for ${year}-${month}:`, err.message);
    return null;
  }
}

/**
 * Extract (year, month) in UTC from a Date-like value. Returns null when the
 * input is missing/invalid — callers should no-op in that case.
 */
function monthKeyFromDate(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
}

async function getMonthly(req, res) {
  const now = new Date();
  const year = parseInt(req.query.year, 10) || now.getUTCFullYear();
  const month = parseInt(req.query.month, 10) || (now.getUTCMonth() + 1);

  if (month < 1 || month > 12) {
    return res.status(400).json({
      success: false,
      result: null,
      message: 'month must be between 1 and 12',
    });
  }

  // Read the cached snapshot. Write hooks (sales/case/ads mutations) keep this
  // row up-to-date, so the dashboard never has to recompute on a cold open.
  // If the row is missing (first-time lookup for an older month), fall through
  // to a one-shot compute + upsert so history always fills in on demand.
  let snapshot = await models.MonthlySalesSummary.findOne({
    where: { year, month },
    raw: true,
  });

  if (!snapshot) {
    await recomputeMonthlyPnl(year, month);
    snapshot = await models.MonthlySalesSummary.findOne({
      where: { year, month },
      raw: true,
    });
  }

  const result = snapshot
    ? {
        year,
        month,
        revenue: toNum(snapshot.revenue),
        cost_of_goods: toNum(snapshot.cost_of_goods),
        shipping_cost: toNum(snapshot.shipping_cost),
        gross_profit: toNum(snapshot.gross_profit),
        gross_margin: toNum(snapshot.gross_margin),
        ads_cost: toNum(snapshot.ads_cost),
        platform_fees: toNum(snapshot.platform_fees),
        labor_cost: toNum(snapshot.labor_cost),
        warehouse_cost: toNum(snapshot.warehouse_cost),
        loss: toNum(snapshot.loss),
        tax: toNum(snapshot.tax),
        net_profit: toNum(snapshot.net_profit),
        net_margin: toNum(snapshot.net_margin),
      }
    : await computePnl(year, month);

  return res.status(200).json({
    success: true,
    result,
    message: 'Monthly P&L',
  });
}

async function upsertAds(req, res) {
  const year = parseInt(req.query.year, 10);
  const month = parseInt(req.query.month, 10);
  const rawPlatformId = req.query.platform_id;
  const platformId =
    rawPlatformId === undefined || rawPlatformId === '' || rawPlatformId === 'null'
      ? null
      : parseInt(rawPlatformId, 10);
  const amount = toNum(req.body?.amount);

  if (!year || !month || month < 1 || month > 12) {
    return res.status(400).json({
      success: false,
      result: null,
      message: 'year and month (1-12) are required',
    });
  }

  const [row] = await models.AdsSpend.findOrCreate({
    where: { year, month, platform_id: platformId },
    defaults: {
      year,
      month,
      platform_id: platformId,
      amount,
      removed: false,
      created: new Date(),
      updated: new Date(),
    },
  });
  await row.update({ amount, removed: false, updated: new Date() });

  // Ads affects net_profit directly — refresh the snapshot for this month.
  await recomputeMonthlyPnl(year, month);

  return res.status(200).json({
    success: true,
    result: row,
    message: 'Ads spend saved',
  });
}

module.exports = {
  getMonthly,
  upsertAds,
  recomputeMonthlyPnl,
  monthKeyFromDate,
};
