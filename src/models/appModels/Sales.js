const mongoose = require('mongoose');

const salesSchema = new mongoose.Schema({
  removed: {
    type: Boolean,
    default: false,
  },
  createdBy: { type: mongoose.Schema.ObjectId, ref: 'Admin', required: true, autopopulate: true },
  name: {
    type: String,
  },
  status: {
    type: String,
    enum: ['new', 'pending', 'won', 'lost', 'cancelled'],
    default: 'new',
  },
  date: {
    type: Date,
  },
  notes: {
    type: String,
  },
  // Order / fulfilment fields
  order_no: { type: String },
  platform: { type: String },
  product_name: { type: String },
  sku: { type: String },
  quantity: { type: Number, default: 0 },
  sale_price_aud: { type: Number, default: 0 },
  shipping_price_aud: { type: Number, default: 0 },
  cost_aud: { type: Number, default: 0 },
  shipping_cost_aud: { type: Number, default: 0 },
  gross_profit: { type: Number, default: 0 },
  // Client reference
  client: { type: mongoose.Schema.ObjectId, ref: 'Client', autopopulate: true },
  // Shipping fields
  warehouse_location: { type: String },
  shipping_no: { type: String },
  logistics_company: { type: String },
  carrier: { type: String },
  transport_status: { type: String },
  created: {
    type: Date,
    default: Date.now,
  },
  updated: {
    type: Date,
    default: Date.now,
  },
});

salesSchema.plugin(require('mongoose-autopopulate'));
module.exports = mongoose.model('Sales', salesSchema);
