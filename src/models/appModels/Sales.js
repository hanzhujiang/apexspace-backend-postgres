const mongoose = require('mongoose');

const salesSchema = new mongoose.Schema({
  removed: {
    type: Boolean,
    default: false,
  },
  createdBy: { type: mongoose.Schema.ObjectId, ref: 'Admin', required: true },
  name: {
    type: String,
    required: true,
  },
  client: {
    type: mongoose.Schema.ObjectId,
    ref: 'Client',
    autopopulate: true,
  },
  amount: {
    type: Number,
    default: 0,
  },
  currency: {
    type: String,
    default: 'USD',
    uppercase: true,
  },
  status: {
    type: String,
    enum: ['new', 'pending', 'won', 'lost', 'cancelled'],
    default: 'new',
  },
  date: {
    type: Date,
  },
  closedDate: {
    type: Date,
  },
  notes: {
    type: String,
  },
  // Order / fulfilment fields
  order_no: { type: String },
  month: { type: String },
  platform: { type: String },
  product_name: { type: String },
  sku: { type: String },
  quantity: { type: Number, default: 0 },
  sale_price_aud: { type: Number, default: 0 },
  cost_aud: { type: Number, default: 0 },
  // Contact / shipping fields
  contact: { type: String },
  phone: { type: String },
  address: { type: String },
  warehouse: { type: String },
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
