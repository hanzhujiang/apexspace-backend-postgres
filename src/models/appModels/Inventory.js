const mongoose = require('mongoose');

const inventorySchema = new mongoose.Schema({
  removed: { type: Boolean, default: false },
  sku: { type: String, required: true, unique: true },
  stock_all: { type: Number, default: 0 },
  stock: { type: Map, of: Number, default: {} },
  on_the_way: { type: Map, of: Number, default: {} },
  created: { type: Date, default: Date.now },
  updated: { type: Date, default: Date.now },
});

inventorySchema.plugin(require('mongoose-autopopulate'));
module.exports = mongoose.model('Inventory', inventorySchema);
