require('dotenv').config({ path: '.env' });
require('dotenv').config({ path: '.env.local' });

const { Sequelize, DataTypes, Op } = require('sequelize');

const commonOptions = {
  dialect: 'postgres',
  logging: process.env.NODE_ENV === 'development' ? console.log : false,
  pool: { max: 10, min: 0, acquire: 30000, idle: 10000 },
  define: { timestamps: false },
  dialectOptions: process.env.PGSSL === 'require'
    ? { ssl: { require: true, rejectUnauthorized: false } }
    : undefined,
};

const sequelize = process.env.DATABASE_URL
  ? new Sequelize(process.env.DATABASE_URL, commonOptions)
  : new Sequelize(
      process.env.POSTGRES_DATABASE || 'apexspace_crm',
      process.env.POSTGRES_USER || 'postgres',
      process.env.POSTGRES_PASSWORD || '',
      {
        ...commonOptions,
        host: process.env.POSTGRES_HOST || 'localhost',
        port: parseInt(process.env.POSTGRES_PORT || '5432'),
      }
    );

// ─── Models ───────────────────────────────────────────────────────────────────

const Admin = sequelize.define('Admin', {
  id:       { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  removed:  { type: DataTypes.BOOLEAN, defaultValue: false },
  enabled:  { type: DataTypes.BOOLEAN, defaultValue: false },
  email:    { type: DataTypes.STRING, allowNull: false, unique: true },
  name:     { type: DataTypes.STRING, allowNull: false },
  surname:  DataTypes.STRING,
  photo:    DataTypes.STRING,
  role:     { type: DataTypes.ENUM('owner','admin','manager','employee','create_only','read_only'), defaultValue: 'owner' },
  created:  { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
}, { tableName: 'admins' });

const AdminPassword = sequelize.define('AdminPassword', {
  id:            { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  removed:       { type: DataTypes.BOOLEAN, defaultValue: false },
  password:      { type: DataTypes.STRING, allowNull: false },
  salt:          { type: DataTypes.STRING, allowNull: false },
  emailToken:    DataTypes.STRING,
  resetToken:    DataTypes.STRING,
  emailVerified: { type: DataTypes.BOOLEAN, defaultValue: false },
  authType:      { type: DataTypes.STRING, defaultValue: 'email' },
}, { tableName: 'admin_passwords' });

// Replaces loggedSessions: [String] array on AdminPassword
const AdminSession = sequelize.define('AdminSession', {
  id:         { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  token:      { type: DataTypes.TEXT, allowNull: false },
  created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
}, { tableName: 'admin_sessions' });

// Activity audit — one row per (admin, token) activity window. Used by the
// /api/user-sessions page. Separate from AdminSession (which is a JWT whitelist).
const UserSession = sequelize.define('UserSession', {
  id:           { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  admin_id:    { type: DataTypes.INTEGER, allowNull: false },
  startedAt:    { type: DataTypes.DATE, defaultValue: DataTypes.NOW, allowNull: false },
  lastActiveAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW, allowNull: false },
  endedAt:      { type: DataTypes.DATE, defaultValue: null },
  tokenHash:    DataTypes.STRING(128),
  ipAddress:    DataTypes.STRING,
  userAgent:    DataTypes.TEXT,
}, {
  tableName: 'user_sessions',
  indexes: [
    { fields: ['admin_id'] },
    { fields: ['tokenHash'] },
    { fields: ['lastActiveAt'] },
    { fields: ['admin_id', 'lastActiveAt'] },
  ],
});

const Permission = sequelize.define('Permission', {
  id:          { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  role:        { type: DataTypes.ENUM('admin','manager','employee','create_only','read_only'), allowNull: false, unique: true },
  permissions: { type: DataTypes.JSONB, defaultValue: {} },
}, { tableName: 'permissions' });

const Setting = sequelize.define('Setting', {
  id:              { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  removed:         { type: DataTypes.BOOLEAN, defaultValue: false },
  enabled:         { type: DataTypes.BOOLEAN, defaultValue: true },
  settingCategory: { type: DataTypes.STRING, allowNull: false },
  settingKey:      { type: DataTypes.STRING, allowNull: false },
  settingValue:    DataTypes.JSONB,
  integerValue:    DataTypes.INTEGER,   // for $inc operations (e.g. last_invoice_number)
  valueType:       { type: DataTypes.STRING, defaultValue: 'String' },
  isPrivate:       { type: DataTypes.BOOLEAN, defaultValue: false },
  isCoreSetting:   { type: DataTypes.BOOLEAN, defaultValue: false },
}, { tableName: 'settings' });

const Upload = sequelize.define('Upload', {
  id:        { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  removed:   { type: DataTypes.BOOLEAN, defaultValue: false },
  enabled:   { type: DataTypes.BOOLEAN, defaultValue: true },
  modelName: DataTypes.STRING,
  fieldId:   { type: DataTypes.STRING, allowNull: false },
  fileName:  { type: DataTypes.STRING, allowNull: false },
  fileType:  { type: DataTypes.ENUM(
    'jpeg','jpg','png','gif','webp',
    'doc','txt','csv','docx','xls','xlsx','pdf',
    'zip','rar',
    'mp4','mov','avi','mp3','m4a','webm'
  ), allowNull: false },
  isPublic:  { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  userID:    { type: DataTypes.INTEGER },
  isSecure:  { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  path:      { type: DataTypes.STRING, allowNull: false },
  created:   { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
}, { tableName: 'uploads' });

const Client = sequelize.define('Client', {
  id:       { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  removed:  { type: DataTypes.BOOLEAN, defaultValue: false },
  enabled:  { type: DataTypes.BOOLEAN, defaultValue: true },
  name:     { type: DataTypes.STRING, allowNull: false },
  phone:    DataTypes.STRING,
  country:  DataTypes.STRING,
  address:  DataTypes.STRING,
  zipCode:  DataTypes.STRING,
  email:    DataTypes.STRING,
  website:  DataTypes.STRING,
  currency: DataTypes.STRING,
  language: DataTypes.STRING,
  notes:    DataTypes.TEXT,
  created:  { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  updated:  { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
}, { tableName: 'clients' });

const Taxes = sequelize.define('Taxes', {
  id:        { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  removed:   { type: DataTypes.BOOLEAN, defaultValue: false },
  enabled:   { type: DataTypes.BOOLEAN, defaultValue: true },
  taxName:   DataTypes.STRING,
  taxValue:  DataTypes.DECIMAL(5, 2),
  isDefault: { type: DataTypes.BOOLEAN, defaultValue: false },
  created:   { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  updated:   { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
}, { tableName: 'taxes' });

const PaymentMode = sequelize.define('PaymentMode', {
  id:          { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  removed:     { type: DataTypes.BOOLEAN, defaultValue: false },
  enabled:     { type: DataTypes.BOOLEAN, defaultValue: true },
  name:        DataTypes.STRING,
  description: DataTypes.TEXT,
  isDefault:   { type: DataTypes.BOOLEAN, defaultValue: false },
  created:     { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  updated:     { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
}, { tableName: 'payment_modes' });

const Invoice = sequelize.define('Invoice', {
  id:              { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  removed:         { type: DataTypes.BOOLEAN, defaultValue: false },
  number:          { type: DataTypes.INTEGER, allowNull: false },
  year:            { type: DataTypes.INTEGER, allowNull: false },
  content:         DataTypes.TEXT,
  recurring:       { type: DataTypes.ENUM('daily','weekly','monthly','annually','quarter') },
  date:            { type: DataTypes.DATEONLY, allowNull: false },
  expiredDate:     { type: DataTypes.DATEONLY, allowNull: false },
  converted_from:  { type: DataTypes.ENUM('quote','offer') },
  converted_quote_id: DataTypes.INTEGER,
  converted_offer_id: DataTypes.INTEGER,
  taxRate:         { type: DataTypes.DECIMAL(5,2),  defaultValue: 0 },
  subTotal:        { type: DataTypes.DECIMAL(12,2), defaultValue: 0 },
  taxTotal:        { type: DataTypes.DECIMAL(12,2), defaultValue: 0 },
  total:           { type: DataTypes.DECIMAL(12,2), defaultValue: 0 },
  credit:          { type: DataTypes.DECIMAL(12,2), defaultValue: 0 },
  discount:        { type: DataTypes.DECIMAL(12,2), defaultValue: 0 },
  currency:        { type: DataTypes.STRING(3), defaultValue: 'NA' },
  paymentStatus:   { type: DataTypes.ENUM('unpaid','paid','partially'), defaultValue: 'unpaid' },
  isOverdue:       { type: DataTypes.BOOLEAN, defaultValue: false },
  approved:        { type: DataTypes.BOOLEAN, defaultValue: false },
  status:          { type: DataTypes.ENUM('draft','pending','sent','refunded','cancelled','on hold'), defaultValue: 'draft' },
  notes:           DataTypes.TEXT,
  pdf:             DataTypes.STRING,
  created:         { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  updated:         { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
}, { tableName: 'invoices', indexes: [{ unique: true, fields: ['number', 'year'] }] });

const InvoiceItem = sequelize.define('InvoiceItem', {
  id:          { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  itemName:    { type: DataTypes.STRING, allowNull: false },
  description: DataTypes.TEXT,
  quantity:    { type: DataTypes.INTEGER, defaultValue: 1 },
  price:       { type: DataTypes.DECIMAL(12,2), allowNull: false },
  total:       { type: DataTypes.DECIMAL(12,2), allowNull: false },
}, { tableName: 'invoice_items' });

const InvoiceFile = sequelize.define('InvoiceFile', {
  id:          { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  fileId:      DataTypes.STRING,
  name:        DataTypes.STRING,
  path:        DataTypes.STRING,
  description: DataTypes.TEXT,
  isPublic:    { type: DataTypes.BOOLEAN, defaultValue: true },
}, { tableName: 'invoice_files' });

const Quote = sequelize.define('Quote', {
  id:          { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  removed:     { type: DataTypes.BOOLEAN, defaultValue: false },
  number:      { type: DataTypes.INTEGER, allowNull: false },
  year:        { type: DataTypes.INTEGER, allowNull: false },
  content:     DataTypes.TEXT,
  recurring:   { type: DataTypes.ENUM('daily','weekly','monthly','annually','quarter') },
  date:        { type: DataTypes.DATEONLY, allowNull: false },
  expiredDate: { type: DataTypes.DATEONLY, allowNull: false },
  converted:   { type: DataTypes.BOOLEAN, defaultValue: false },
  taxRate:     { type: DataTypes.DECIMAL(5,2),  defaultValue: 0 },
  subTotal:    { type: DataTypes.DECIMAL(12,2), defaultValue: 0 },
  taxTotal:    { type: DataTypes.DECIMAL(12,2), defaultValue: 0 },
  total:       { type: DataTypes.DECIMAL(12,2), defaultValue: 0 },
  credit:      { type: DataTypes.DECIMAL(12,2), defaultValue: 0 },
  discount:    { type: DataTypes.DECIMAL(12,2), defaultValue: 0 },
  currency:    { type: DataTypes.STRING(3), defaultValue: 'NA' },
  status:      { type: DataTypes.ENUM('draft','pending','sent','cancelled','on hold','declined','accepted'), defaultValue: 'draft' },
  approved:    { type: DataTypes.BOOLEAN, defaultValue: false },
  isExpired:   { type: DataTypes.BOOLEAN, defaultValue: false },
  notes:       DataTypes.TEXT,
  pdf:         DataTypes.STRING,
  created:     { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  updated:     { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
}, { tableName: 'quotes', indexes: [{ unique: true, fields: ['number', 'year'] }] });

const QuoteItem = sequelize.define('QuoteItem', {
  id:          { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  itemName:    { type: DataTypes.STRING, allowNull: false },
  description: DataTypes.TEXT,
  quantity:    { type: DataTypes.INTEGER, defaultValue: 1 },
  price:       { type: DataTypes.DECIMAL(12,2), allowNull: false },
  total:       { type: DataTypes.DECIMAL(12,2), allowNull: false },
}, { tableName: 'quote_items' });

const QuoteFile = sequelize.define('QuoteFile', {
  id:          { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  fileId:      DataTypes.STRING,
  name:        DataTypes.STRING,
  path:        DataTypes.STRING,
  description: DataTypes.TEXT,
  isPublic:    { type: DataTypes.BOOLEAN, defaultValue: true },
}, { tableName: 'quote_files' });

const Payment = sequelize.define('Payment', {
  id:          { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  removed:     { type: DataTypes.BOOLEAN, defaultValue: false },
  number:      { type: DataTypes.INTEGER, allowNull: false },
  date:        { type: DataTypes.DATEONLY, allowNull: false },
  amount:      { type: DataTypes.DECIMAL(12,2), allowNull: false },
  currency:    { type: DataTypes.STRING(3), defaultValue: 'NA' },
  ref:         DataTypes.STRING,
  description: DataTypes.TEXT,
  created:     { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  updated:     { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
}, { tableName: 'payments' });

const Warehouse = sequelize.define('Warehouse', {
  id:               { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  removed:          { type: DataTypes.BOOLEAN, defaultValue: false },
  warehouse_id:     { type: DataTypes.STRING, allowNull: false, unique: true },
  nick_name:        { type: DataTypes.STRING, allowNull: false },
  additional_notes: DataTypes.STRING,
  created:          { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  updated:          { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
}, { tableName: 'warehouses' });

const Inventory = sequelize.define('Inventory', {
  id:        { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  removed:   { type: DataTypes.BOOLEAN, defaultValue: false },
  sku:       { type: DataTypes.STRING, allowNull: false, unique: true },
  stock_all: { type: DataTypes.INTEGER, defaultValue: 0 },
  created:   { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  updated:   { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
}, { tableName: 'inventories' });

// Replaces Inventory.stock and on_the_way Map<warehouseId, Number>
const InventoryWarehouseStock = sequelize.define('InventoryWarehouseStock', {
  id:           { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  warehouse_id: { type: DataTypes.STRING, allowNull: false },
  stock:        { type: DataTypes.INTEGER, defaultValue: 0 },
  on_the_way:   { type: DataTypes.INTEGER, defaultValue: 0 },
}, { tableName: 'inventory_warehouse_stock' });

const Sales = sequelize.define('Sales', {
  id:                  { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  removed:             { type: DataTypes.BOOLEAN, defaultValue: false },
  name:                DataTypes.STRING,
  status:              { type: DataTypes.ENUM('new','pending','won','lost','cancelled'), defaultValue: 'new' },
  date:                DataTypes.DATE,
  notes:               DataTypes.TEXT,
  order_no:            DataTypes.STRING,
  platform:            DataTypes.STRING,
  product_name:        DataTypes.STRING,
  sku:                 DataTypes.STRING,
  quantity:            { type: DataTypes.INTEGER,      defaultValue: 0 },
  sale_price_aud:      { type: DataTypes.DECIMAL(12,2), defaultValue: 0 },
  shipping_price_aud:  { type: DataTypes.DECIMAL(12,2), defaultValue: 0 },
  cost_aud:            { type: DataTypes.DECIMAL(12,2), defaultValue: 0 },
  shipping_cost_aud:   { type: DataTypes.DECIMAL(12,2), defaultValue: 0 },
  gross_profit:        { type: DataTypes.DECIMAL(12,2), defaultValue: 0 },
  warehouse_location:  DataTypes.STRING,
  shipping_no:         DataTypes.STRING,
  logistics_company:   DataTypes.STRING,
  carrier:             DataTypes.STRING,
  transport_status:    DataTypes.STRING,
  created:             { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  updated:             { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
}, { tableName: 'sales' });

const ProductCosts = sequelize.define('ProductCosts', {
  id:        { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  removed:   { type: DataTypes.BOOLEAN, defaultValue: false },
  sku:       { type: DataTypes.STRING, allowNull: false },
  cost:      { type: DataTypes.DECIMAL(12,2), defaultValue: 0 },
  date_from: DataTypes.DATEONLY,
  date_to:   DataTypes.DATEONLY,
  created:   { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  updated:   { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
}, { tableName: 'product_costs' });

const KoganSkuWeight = sequelize.define('KoganSkuWeight', {
  id:      { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  removed: { type: DataTypes.BOOLEAN, defaultValue: false },
  sku:     { type: DataTypes.STRING, allowNull: false, unique: true },
  weight:  DataTypes.DECIMAL(8,3),
  created: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  updated: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
}, { tableName: 'kogan_sku_weights' });

// ─── Associations ─────────────────────────────────────────────────────────────

Admin.hasOne(AdminPassword,  { foreignKey: 'admin_id', as: 'passwordRecord' });
AdminPassword.belongsTo(Admin, { foreignKey: 'admin_id', as: 'user' });

AdminPassword.hasMany(AdminSession, { foreignKey: 'admin_password_id', as: 'sessions' });
AdminSession.belongsTo(AdminPassword, { foreignKey: 'admin_password_id' });

Admin.hasMany(UserSession, { foreignKey: 'admin_id', as: 'activitySessions' });
UserSession.belongsTo(Admin, { foreignKey: 'admin_id', as: 'admin' });

Client.belongsTo(Admin, { foreignKey: 'createdBy_id', as: 'createdBy' });
Client.belongsTo(Admin, { foreignKey: 'assigned_id',  as: 'assigned'  });

Invoice.belongsTo(Client, { foreignKey: 'client_id',    as: 'client'    });
Invoice.belongsTo(Admin,  { foreignKey: 'createdBy_id', as: 'createdBy' });
Invoice.hasMany(InvoiceItem, { foreignKey: 'invoice_id', as: 'items' });
Invoice.hasMany(InvoiceFile, { foreignKey: 'invoice_id', as: 'files' });
Invoice.hasMany(Payment,     { foreignKey: 'invoice_id', as: 'payment'  });

Quote.belongsTo(Client, { foreignKey: 'client_id',    as: 'client'    });
Quote.belongsTo(Admin,  { foreignKey: 'createdBy_id', as: 'createdBy' });
Quote.hasMany(QuoteItem, { foreignKey: 'quote_id', as: 'items' });
Quote.hasMany(QuoteFile, { foreignKey: 'quote_id', as: 'files' });

Payment.belongsTo(Invoice,     { foreignKey: 'invoice_id',     as: 'invoice'     });
Payment.belongsTo(Client,      { foreignKey: 'client_id',      as: 'client'      });
Payment.belongsTo(Admin,       { foreignKey: 'createdBy_id',   as: 'createdBy'   });
Payment.belongsTo(PaymentMode, { foreignKey: 'paymentMode_id', as: 'paymentMode' });

Sales.belongsTo(Client, { foreignKey: 'client_id',    as: 'client'    });
Sales.belongsTo(Admin,  { foreignKey: 'createdBy_id', as: 'createdBy' });

Inventory.hasMany(InventoryWarehouseStock, { foreignKey: 'inventory_id', as: 'warehouseStock' });
InventoryWarehouseStock.belongsTo(Inventory, { foreignKey: 'inventory_id' });

// ─── Exports ──────────────────────────────────────────────────────────────────

const models = {
  Admin, AdminPassword, AdminSession, UserSession, Permission, Setting, Upload,
  Client, Taxes, PaymentMode,
  Invoice, InvoiceItem, InvoiceFile,
  Quote, QuoteItem, QuoteFile,
  Payment,
  Warehouse, Inventory, InventoryWarehouseStock,
  Sales, ProductCosts, KoganSkuWeight,
};

// Frontend (toblo-frontend-next) was written against the Mongoose shape and
// reads `record._id` throughout. Mirror the integer `id` as `_id` on every
// serialized Sequelize instance (including nested associations) so the
// frontend contract stays stable. Sequelize's default toJSON uses
// get({plain:true}) which does NOT recursively invoke toJSON on children,
// so we walk the resulting plain tree ourselves.
function injectMongoIdDeep(value) {
  if (Array.isArray(value)) {
    for (const item of value) injectMongoIdDeep(item);
    return;
  }
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    if ('id' in value && !('_id' in value) && (typeof value.id === 'number' || typeof value.id === 'string')) {
      value._id = value.id;
    }
    for (const k of Object.keys(value)) injectMongoIdDeep(value[k]);
  }
}

for (const name of Object.keys(models)) {
  const Model = models[name];
  const originalToJSON = Model.prototype.toJSON;
  Model.prototype.toJSON = function () {
    const values = originalToJSON.call(this);
    injectMongoIdDeep(values);
    return values;
  };
}

async function syncDatabase({ alter = false, force = false } = {}) {
  await sequelize.sync({ alter, force });
  console.log('PostgreSQL schema synced');
}

module.exports = { sequelize, models, DataTypes, Op, syncDatabase };
