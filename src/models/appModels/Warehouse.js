const mongoose = require('mongoose');

const warehouseSchema = new mongoose.Schema({
  removed: { type: Boolean, default: false },
  warehouse_id: { type: String, required: true, unique: true },
  nick_name: { type: String, required: true },
  additional_notes: { type: String },
  created: { type: Date, default: Date.now },
  updated: { type: Date, default: Date.now },
});

warehouseSchema.plugin(require('mongoose-autopopulate'));
module.exports = mongoose.model('Warehouse', warehouseSchema);
