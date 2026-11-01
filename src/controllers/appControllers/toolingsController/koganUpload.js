const { models, Op, sequelize } = require('@/db');
const { koganShippingPriceCalculator } = require('./koganShippingPriceCalculator');
const { KOGAN_SKU_WEIGHTS } = require('./koganConstants');

const Sales = models.Sales;
const Client = models.Client;
const ProductCosts = models.ProductCosts;
const KoganSkuWeight = models.KoganSkuWeight;

// Parse YYYYMMDD from filenames like 20261021T064214_AUAXS_KOGAN_OrderManifest.csv,
// then subtract 1 day (Kogan manifest date is dispatch date, orders placed the day before).
function parseDateFromFilename(filename) {
  const match = String(filename).match(/^(\d{8})T/);
  if (!match) return null;
  const s = match[1];
  const d = new Date(
    Date.UTC(
      parseInt(s.slice(0, 4), 10),
      parseInt(s.slice(4, 6), 10) - 1,
      parseInt(s.slice(6, 8), 10)
    )
  );
  d.setUTCDate(d.getUTCDate() - 1);
  return d;
}

function parseCSV(text) {
  const cleaned = text.replace(/^﻿/, '');
  const lines = cleaned
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .filter((l) => l.trim());
  if (lines.length < 2) return [];

  function parseRow(line) {
    const fields = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === ',' && !inQuotes) {
        fields.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
    fields.push(current);
    return fields;
  }

  const headers = parseRow(lines[0]);
  return lines.slice(1).map((line) => {
    const values = parseRow(line);
    const row = {};
    headers.forEach((h, i) => {
      row[h.trim()] = (values[i] ?? '').trim();
    });
    return row;
  });
}

function assembleAddress(row) {
  return [
    row.DeliveryAddress1,
    row.DeliveryAddress2,
    row.DeliverySuburb,
    `${row.DeliveryState} ${row.DeliveryPostCode}`.trim(),
  ]
    .filter(Boolean)
    .join(', ');
}

const koganUpload = async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: 'No CSV file uploaded.' });
  }

  const csvText = req.file.buffer.toString('utf-8');
  const rows = parseCSV(csvText);

  if (rows.length === 0) {
    return res
      .status(400)
      .json({ success: false, message: 'CSV file is empty or has no data rows.' });
  }

  // Order date: filename prefix minus 1 day, fallback to upload date
  const now = new Date();
  const orderDate = parseDateFromFilename(req.file.originalname) || now;

  // 1. Reject if any order_no already exists
  const csvOrderIds = [...new Set(rows.map((r) => r.OrderID).filter(Boolean))];
  const existingSales = await Sales.findAll({
    where: { order_no: { [Op.in]: csvOrderIds }, removed: false },
    attributes: ['order_no'],
    raw: true,
  });
  if (existingSales.length > 0) {
    const duplicates = existingSales.map((s) => s.order_no);
    return res.status(400).json({
      success: false,
      message: `Upload rejected: ${duplicates.length} order_no(s) already exist in the system.`,
      duplicates,
    });
  }

  // 2. Load SKU weight map from DB; fall back to static constant if DB is empty
  const weightDocs = await KoganSkuWeight.findAll({
    where: { removed: false },
    attributes: ['sku', 'weight'],
    raw: true,
  });
  const skuWeightMap =
    weightDocs.length > 0
      ? Object.fromEntries(weightDocs.map((d) => [d.sku, Number(d.weight)]))
      : KOGAN_SKU_WEIGHTS;

  // 3. Deduplicate client candidates within the CSV
  const clientCandidates = new Map();
  for (const row of rows) {
    const address = assembleAddress(row);
    const key = `${row.DeliveryName}|${row.DeliveryPhone}|${address}`;
    if (!clientCandidates.has(key)) {
      clientCandidates.set(key, {
        name: row.DeliveryName,
        phone: row.DeliveryPhone,
        address,
        country: 'AU',
      });
    }
  }

  // 4. Upsert clients
  const clientIdMap = new Map();
  let clientsCreated = 0;
  let clientsReused = 0;

  for (const [key, candidate] of clientCandidates) {
    const [client, created] = await Client.findOrCreate({
      where: {
        name: candidate.name,
        phone: candidate.phone,
        address: candidate.address,
        removed: false,
      },
      defaults: {
        ...candidate,
        removed: false,
        enabled: true,
        createdBy_id: req.admin.id,
        created: now,
        updated: now,
      },
    });
    clientIdMap.set(key, client.id);
    if (created) clientsCreated++;
    else clientsReused++;
  }

  // 5. Build sales docs
  const salesDocs = [];

  for (const row of rows) {
    const sku = row.ProductCode.replace(/^AXS-/, '');

    let shippingPrice = 0;
    try {
      shippingPrice = koganShippingPriceCalculator(sku, row.DeliveryPostCode, skuWeightMap);
    } catch (err) {
      return res.status(400).json({ success: false, message: err.message });
    }

    const costRecord = await ProductCosts.findOne({
      where: {
        sku,
        removed: false,
        date_from: { [Op.lte]: now },
        [Op.or]: [{ date_to: null }, { date_to: { [Op.gte]: now } }],
      },
      order: [['date_from', 'DESC']],
      raw: true,
    });

    const address = assembleAddress(row);
    const clientKey = `${row.DeliveryName}|${row.DeliveryPhone}|${address}`;

    salesDocs.push({
      order_no: row.OrderID,
      platform: 'Kogan',
      product_name: row.ProductCode,
      sku,
      quantity: parseInt(row.Quantity, 10) || 0,
      sale_price_aud: parseFloat(row.ItemPrice) || 0,
      shipping_price_aud: shippingPrice,
      cost_aud: costRecord?.cost ?? 0,
      client_id: clientIdMap.get(clientKey),
      date: orderDate,
      status: 'new',
      removed: false,
      createdBy_id: req.admin.id,
      created: now,
      updated: now,
    });
  }

  // 6. Insert all sales
  await Sales.bulkCreate(salesDocs, { ignoreDuplicates: true });

  return res.status(200).json({
    success: true,
    message: `Import complete: ${salesDocs.length} sales created, ${clientsCreated} new clients, ${clientsReused} existing clients reused.`,
    result: {
      salesCreated: salesDocs.length,
      clientsCreated,
      clientsReused,
    },
  });
};

module.exports = koganUpload;
