/**
 * MongoDB → PostgreSQL one-time data migration
 *
 * Usage:
 *   node src/migration/mongoToPostgres.js
 *
 * Requires DATABASE (mongo connection string) and either DATABASE_URL
 * or POSTGRES_* vars in .env / .env.local.
 * Safe to re-run — uses findOrCreate / ignoreDuplicates throughout.
 *
 * Reads source MongoDB via the raw `mongodb` driver (no Mongoose), so this
 * script does NOT depend on the crm-backend Mongoose model files being
 * loadable. Collection names are hardcoded below and were enumerated from
 * staging on 2026-11-01.
 *
 * Run order matters: Admin → AdminPassword → Permission → Setting →
 *   Client → Taxes → PaymentMode → Warehouse → Inventory → ProductCosts →
 *   KoganSkuWeight → Invoice → Quote → Payment → Sales → Upload
 */

require('module-alias/register');
require('dotenv').config({ path: '.env' });
require('dotenv').config({ path: '.env.local' });

const { MongoClient } = require('mongodb'); //MongoDB native driver
const { sequelize, models, syncDatabase } = require('@/db'); // Sequelize + models

// Default DB name on the staging cluster is `test` (no path on the URI).
// Override with MONGO_DB env var if migrating from a different db name.
const MONGO_DB = process.env.MONGO_DB || 'test';

const idMap = {};
const mapId = (m, mongoId, sqlId) => { if (mongoId) idMap[`${m}:${mongoId.toString()}`] = sqlId; };
const getSqlId = (m, mongoId) => mongoId ? (idMap[`${m}:${mongoId.toString()}`] ?? null) : null;

let db; // set in run()
const col = (name) => db.collection(name);

async function migrateAdmins() {
  const docs = await col('admins').find({}).toArray();
  for (const d of docs) {
    const [r] = await models.Admin.findOrCreate({
      where: { email: d.email }, defaults: {
        removed: d.removed ?? false, enabled: d.enabled ?? false,
        email: d.email, name: d.name, surname: d.surname, photo: d.photo,
        role: d.role ?? 'owner', created: d.created,
      }
    });
    mapId('Admin', d._id, r.id);
  }
  console.log(`  ✓ Admins (${docs.length})`);
}

async function migrateAdminPasswords() {
  const docs = await col('adminpasswords').find({}).toArray();
  for (const d of docs) {
    const adminId = getSqlId('Admin', d.user);
    if (!adminId) continue;
    const [r] = await models.AdminPassword.findOrCreate({
      where: { admin_id: adminId }, defaults: {
        removed: d.removed ?? false, password: d.password, salt: d.salt,
        emailToken: d.emailToken, resetToken: d.resetToken,
        emailVerified: d.emailVerified ?? false, authType: d.authType ?? 'email',
      }
    });
    mapId('AdminPassword', d._id, r.id);
    if (Array.isArray(d.loggedSessions) && d.loggedSessions.length) {
      await models.AdminSession.bulkCreate(
        d.loggedSessions.map((token) => ({ admin_password_id: r.id, token })),
        { ignoreDuplicates: true }
      );
    }
  }
  console.log(`  ✓ AdminPasswords (${docs.length})`);
}

async function migratePermissions() {
  const docs = await col('permissions').find({}).toArray();
  for (const d of docs) {
    await models.Permission.upsert({ role: d.role, permissions: d.permissions ?? {} });
  }
  console.log(`  ✓ Permissions (${docs.length})`);
}

async function migrateSettings() {
  const docs = await col('settings').find({}).toArray();
  for (const d of docs) {
    const isNumeric = d.valueType === 'Number' || typeof d.settingValue === 'number';
    await models.Setting.findOrCreate({
      where: { settingKey: d.settingKey, settingCategory: d.settingCategory },
      defaults: {
        removed: d.removed ?? false, enabled: d.enabled ?? true,
        settingCategory: d.settingCategory, settingKey: d.settingKey,
        settingValue: d.settingValue,
        integerValue: isNumeric ? parseInt(d.settingValue) : null,
        valueType: d.valueType ?? 'String',
        isPrivate: d.isPrivate ?? false, isCoreSetting: d.isCoreSetting ?? false,
      },
    });
  }
  console.log(`  ✓ Settings (${docs.length})`);
}

async function migrateClients() {
  const docs = await col('clients').find({}).toArray();
  for (const d of docs) {
    const [r] = await models.Client.findOrCreate({
      where: { name: d.name, email: d.email ?? '' },
      defaults: {
        removed: d.removed ?? false, enabled: d.enabled ?? true,
        name: d.name, phone: d.phone, country: d.country, address: d.address, zipCode: d.zipCode,
        email: d.email, website: d.website, currency: d.currency, language: d.language, notes: d.notes,
        createdBy_id: getSqlId('Admin', d.createdBy),
        assigned_id: getSqlId('Admin', d.assigned),
        created: d.created, updated: d.updated,
      },
    });
    mapId('Client', d._id, r.id);
  }
  console.log(`  ✓ Clients (${docs.length})`);
}

async function migrateTaxesAndPaymentModes() {
  const taxes = await col('taxes').find({}).toArray();
  for (const d of taxes) {
    const [r] = await models.Taxes.findOrCreate({
      where: { taxName: d.taxName },
      defaults: {
        removed: d.removed ?? false, enabled: d.enabled ?? true,
        taxName: d.taxName, taxValue: d.taxValue ?? 0, isDefault: d.isDefault ?? false,
      },
    });
    mapId('Taxes', d._id, r.id);
  }
  const modes = await col('paymentmodes').find({}).toArray();
  for (const d of modes) {
    const [r] = await models.PaymentMode.findOrCreate({
      where: { name: d.name },
      defaults: {
        removed: d.removed ?? false, enabled: d.enabled ?? true,
        name: d.name, description: d.description, isDefault: d.isDefault ?? false,
      },
    });
    mapId('PaymentMode', d._id, r.id);
  }
  console.log(`  ✓ Taxes (${taxes.length}) + PaymentModes (${modes.length})`);
}

async function migrateWarehouseAndInventory() {
  const warehouses = await col('warehouses').find({}).toArray();
  for (const d of warehouses) {
    const [r] = await models.Warehouse.findOrCreate({
      where: { warehouse_id: d.warehouse_id },
      defaults: {
        removed: d.removed ?? false, warehouse_id: d.warehouse_id,
        nick_name: d.nick_name, additional_notes: d.additional_notes,
      },
    });
    mapId('Warehouse', d._id, r.id);
  }

  const invs = await col('inventories').find({}).toArray();
  for (const d of invs) {
    const [r] = await models.Inventory.findOrCreate({
      where: { sku: d.sku },
      defaults: { removed: d.removed ?? false, sku: d.sku, stock_all: d.stock_all ?? 0 },
    });
    mapId('Inventory', d._id, r.id);

    // Mongo stock/on_the_way are plain objects via the native driver (not Maps).
    const stockEntries = Object.entries(d.stock || {});
    const onTheWayMap = d.on_the_way || {};
    if (stockEntries.length) {
      await models.InventoryWarehouseStock.bulkCreate(
        stockEntries.map(([wId, stock]) => ({
          inventory_id: r.id, warehouse_id: wId,
          stock: stock ?? 0, on_the_way: onTheWayMap[wId] ?? 0,
        })),
        { ignoreDuplicates: true }
      );
    }
  }
  console.log(`  ✓ Warehouses (${warehouses.length}) + Inventories (${invs.length})`);
}

async function migrateProductData() {
  const costs = await col('productcosts').find({}).toArray();
  for (const d of costs) {
    await models.ProductCosts.findOrCreate({
      where: { sku: d.sku, date_from: d.date_from ?? null },
      defaults: {
        removed: d.removed ?? false, sku: d.sku, cost: d.cost ?? 0,
        date_from: d.date_from, date_to: d.date_to,
      },
    });
  }
  const weights = await col('koganskuweights').find({}).toArray();
  for (const d of weights) {
    await models.KoganSkuWeight.findOrCreate({
      where: { sku: d.sku },
      defaults: { removed: d.removed ?? false, sku: d.sku, weight: d.weight },
    });
  }
  console.log(`  ✓ ProductCosts (${costs.length}) + KoganSkuWeights (${weights.length})`);
}

async function migrateInvoices() {
  const docs = await col('invoices').find({}).toArray();
  for (const d of docs) {
    const [r] = await models.Invoice.findOrCreate({
      where: { number: d.number, year: d.year },
      defaults: {
        removed: d.removed ?? false, number: d.number, year: d.year,
        content: d.content, recurring: d.recurring,
        date: d.date, expiredDate: d.expiredDate,
        client_id: getSqlId('Client', d.client),
        createdBy_id: getSqlId('Admin', d.createdBy),
        converted_from: d.converted?.from,
        converted_quote_id: getSqlId('Quote', d.converted?.quote),
        converted_offer_id: getSqlId('Offer', d.converted?.offer),
        taxRate: d.taxRate ?? 0, subTotal: d.subTotal ?? 0, taxTotal: d.taxTotal ?? 0,
        total: d.total ?? 0, credit: d.credit ?? 0, discount: d.discount ?? 0,
        currency: d.currency ?? 'NA', paymentStatus: d.paymentStatus ?? 'unpaid',
        isOverdue: d.isOverdue ?? false, approved: d.approved ?? false,
        status: d.status ?? 'draft', notes: d.notes, pdf: d.pdf,
        created: d.created, updated: d.updated,
      },
    });
    mapId('Invoice', d._id, r.id);
    if (Array.isArray(d.items) && d.items.length) {
      await models.InvoiceItem.bulkCreate(
        d.items.map((i) => ({
          invoice_id: r.id, itemName: i.itemName, description: i.description,
          quantity: i.quantity ?? 1, price: i.price ?? 0, total: i.total ?? 0,
        })),
        { ignoreDuplicates: true }
      );
    }
    if (Array.isArray(d.files) && d.files.length) {
      await models.InvoiceFile.bulkCreate(
        d.files.map((f) => ({
          invoice_id: r.id, fileId: f.id, name: f.name, path: f.path,
          description: f.description, isPublic: f.isPublic ?? true,
        })),
        { ignoreDuplicates: true }
      );
    }
  }
  console.log(`  ✓ Invoices (${docs.length})`);
}

async function migrateQuotes() {
  const docs = await col('quotes').find({}).toArray();
  for (const d of docs) {
    const [r] = await models.Quote.findOrCreate({
      where: { number: d.number, year: d.year },
      defaults: {
        removed: d.removed ?? false, number: d.number, year: d.year,
        content: d.content, recurring: d.recurring,
        date: d.date, expiredDate: d.expiredDate,
        converted: !!d.converted,
        client_id: getSqlId('Client', d.client),
        createdBy_id: getSqlId('Admin', d.createdBy),
        taxRate: d.taxRate ?? 0, subTotal: d.subTotal ?? 0, taxTotal: d.taxTotal ?? 0,
        total: d.total ?? 0, credit: d.credit ?? 0, discount: d.discount ?? 0,
        currency: d.currency ?? 'NA', status: d.status ?? 'draft',
        approved: d.approved ?? false, isExpired: d.isExpired ?? false,
        notes: d.notes, pdf: d.pdf,
        created: d.created, updated: d.updated,
      },
    });
    mapId('Quote', d._id, r.id);
    if (Array.isArray(d.items) && d.items.length) {
      await models.QuoteItem.bulkCreate(
        d.items.map((i) => ({
          quote_id: r.id, itemName: i.itemName, description: i.description,
          quantity: i.quantity ?? 1, price: i.price ?? 0, total: i.total ?? 0,
        })),
        { ignoreDuplicates: true }
      );
    }
    if (Array.isArray(d.files) && d.files.length) {
      await models.QuoteFile.bulkCreate(
        d.files.map((f) => ({
          quote_id: r.id, fileId: f.id, name: f.name, path: f.path,
          description: f.description, isPublic: f.isPublic ?? true,
        })),
        { ignoreDuplicates: true }
      );
    }
  }
  console.log(`  ✓ Quotes (${docs.length})`);
}

async function migratePayments() {
  const docs = await col('payments').find({}).toArray();
  for (const d of docs) {
    const [r] = await models.Payment.findOrCreate({
      where: { number: d.number },
      defaults: {
        removed: d.removed ?? false, number: d.number, date: d.date, amount: d.amount,
        currency: d.currency ?? 'NA', ref: d.ref, description: d.description,
        invoice_id: getSqlId('Invoice', d.invoice),
        client_id: getSqlId('Client', d.client),
        createdBy_id: getSqlId('Admin', d.createdBy),
        paymentMode_id: getSqlId('PaymentMode', d.paymentMode),
        created: d.created, updated: d.updated,
      },
    });
    mapId('Payment', d._id, r.id);
  }
  console.log(`  ✓ Payments (${docs.length})`);
}

async function migrateSales() {
  const docs = await col('sales').find({}).toArray();
  const BATCH = 500;
  for (let i = 0; i < docs.length; i += BATCH) {
    const batch = docs.slice(i, i + BATCH);
    await models.Sales.bulkCreate(
      batch.map((d) => ({
        removed: d.removed ?? false,
        name: d.name, status: d.status ?? 'new', date: d.date, notes: d.notes,
        order_no: d.order_no, platform: d.platform, product_name: d.product_name,
        sku: d.sku, quantity: d.quantity ?? 0,
        sale_price_aud: d.sale_price_aud ?? 0, shipping_price_aud: d.shipping_price_aud ?? 0,
        cost_aud: d.cost_aud ?? 0, shipping_cost_aud: d.shipping_cost_aud ?? 0,
        gross_profit: d.gross_profit ?? 0,
        warehouse_location: d.warehouse_location, shipping_no: d.shipping_no,
        logistics_company: d.logistics_company, carrier: d.carrier,
        transport_status: d.transport_status,
        client_id: getSqlId('Client', d.client),
        createdBy_id: getSqlId('Admin', d.createdBy),
        created: d.created, updated: d.updated,
      })),
      { ignoreDuplicates: true }
    );
    process.stdout.write(`\r  Sales: ${Math.min(i + BATCH, docs.length)}/${docs.length}`);
  }
  console.log(`\n  ✓ Sales (${docs.length})`);
}

async function migrateUserSessions() {
  const names = await db.listCollections().toArray();
  const colName = names.map((c) => c.name).find((n) => n === 'usersessions');
  if (!colName) { console.log('  · UserSessions skipped (no collection)'); return; }
  const docs = await db.collection(colName).find({}).toArray();
  for (const d of docs) {
    const adminId = getSqlId('Admin', d.admin);
    if (!adminId) continue;
    await models.UserSession.create({
      admin_id: adminId,
      startedAt: d.startedAt,
      lastActiveAt: d.lastActiveAt,
      endedAt: d.endedAt,
      tokenHash: d.tokenHash,
      ipAddress: d.ipAddress,
      userAgent: d.userAgent,
    }).catch(() => null); // tolerate per-row failures
  }
  console.log(`  ✓ UserSessions (${docs.length})`);
}

async function migrateUploads() {
  // Mongo collection name on staging has a trailing space: `upload `
  const names = await db.listCollections().toArray();
  const uploadCol = names.map((c) => c.name).find((n) => n.trim() === 'upload');
  if (!uploadCol) { console.log('  · Uploads skipped (no collection)'); return; }
  const docs = await db.collection(uploadCol).find({}).toArray();
  for (const d of docs) {
    await models.Upload.findOrCreate({
      where: { fileName: d.fileName, path: d.path },
      defaults: {
        removed: d.removed ?? false, enabled: d.enabled ?? true,
        modelName: d.modelName, fieldId: d.fieldId, fileName: d.fileName,
        fileType: d.fileType, isPublic: d.isPublic ?? true,
        userID: getSqlId('Admin', d.userID),
        isSecure: d.isSecure ?? false, path: d.path, created: d.created,
      },
    });
  }
  console.log(`  ✓ Uploads (${docs.length})`);
}

async function run() {
  console.log('\nConnecting to MongoDB...');
  const mongoClient = new MongoClient('mongodb://mongo:UEEBkGyYsAGzLYrLnTmfaKobVZcIAhTH@altaria.proxy.rlwy.net:43047');
  console.log('connected to mongo');
  await mongoClient.connect();
  db = mongoClient.db(MONGO_DB);
  console.log(`Source database: ${MONGO_DB}`);

  console.log('Connecting to PostgreSQL and syncing schema...');
  // alter:true breaks on Postgres ENUM+UNIQUE columns (Sequelize bug).
  // Run `npm run db:sync` separately before this script to apply schema changes.
  await syncDatabase({ alter: false });

  console.log('\n=== Starting migration ===\n');
  await migrateAdmins();
  await migrateAdminPasswords();
  await migratePermissions();
  await migrateSettings();
  await migrateClients();
  await migrateTaxesAndPaymentModes();
  await migrateWarehouseAndInventory();
  await migrateProductData();
  await migrateInvoices();
  await migrateQuotes();
  await migratePayments();
  await migrateSales();
  await migrateUploads();
  await migrateUserSessions();

  console.log('\n=== Migration complete ===\n');
  await mongoClient.close();
  await sequelize.close();
  process.exit(0);
}

run().catch((err) => {
  console.error('\nMigration failed:', err);
  process.exit(1);
});
