const mongoose = require('mongoose');

const productCostsSchema = new mongoose.Schema({
  removed:   { type: Boolean, default: false },
  sku:       { type: String, required: true },
  date_from: { type: Date, required: true },
  date_to:   { type: Date, default: null },
  cost:      { type: Number, required: true },
  created:   { type: Date, default: Date.now },
  updated:   { type: Date, default: Date.now },
});

module.exports = mongoose.model('ProductCosts', productCostsSchema);
