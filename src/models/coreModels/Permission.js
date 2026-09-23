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
    settings:       { type: Boolean, default: false },
    salesAssistant: { type: Boolean, default: true },
  },
});

module.exports = mongoose.model('Permission', permissionSchema);
