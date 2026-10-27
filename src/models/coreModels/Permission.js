const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const NON_OWNER_ROLES = ['admin', 'manager', 'employee', 'create_only', 'read_only'];

const permissionSchema = new Schema({
  role: {
    type: String,
    required: true,
    unique: true,
    enum: NON_OWNER_ROLES,
  },
  permissions: {
    dashboard:   { type: Boolean, default: true },
    customer:    { type: Boolean, default: true },
    invoice:     { type: Boolean, default: true },
    quote:       { type: Boolean, default: true },
    payment:     { type: Boolean, default: true },
    paymentMode: { type: Boolean, default: true },
    taxes:       { type: Boolean, default: true },
    sales:       { type: Boolean, default: true },
    toolings:       { type: Boolean, default: true },
    inventory:      { type: Boolean, default: true },
    warehouse:      { type: Boolean, default: true },
    productCosts:   { type: Boolean, default: true },
    settings:       { type: Boolean, default: false },
    shopSettings:   { type: Boolean, default: false },
    salesAssistant: { type: Boolean, default: true },
    // Dashboard card-level permissions
    dashboardSummaryInvoices:    { type: Boolean, default: true },
    dashboardSummaryQuote:       { type: Boolean, default: true },
    dashboardSummaryPayment:     { type: Boolean, default: true },
    dashboardSummaryUnpaid:      { type: Boolean, default: true },
    dashboardChartInvoices:      { type: Boolean, default: true },
    dashboardChartQuote:         { type: Boolean, default: true },
    dashboardCustomers:          { type: Boolean, default: true },
    dashboardRecentSales:        { type: Boolean, default: true },
    dashboardTopSkus:            { type: Boolean, default: true },
    dashboardEmployeePerformance:{ type: Boolean, default: true },
    shopSettingsLoadDefaults:    { type: Boolean, default: false },
    shopSettingsDelete:          { type: Boolean, default: false },
  },
});

module.exports = mongoose.model('Permission', permissionSchema);
