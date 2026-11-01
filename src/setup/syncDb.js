require('dotenv').config({ path: '.env' });
require('dotenv').config({ path: '.env.local' });
const { syncDatabase } = require('../db');

syncDatabase({ alter: process.env.NODE_ENV !== 'production' })
  .then(() => { console.log('✅ Schema synced'); process.exit(0); })
  .catch((e) => { console.error('❌ Sync failed:', e.message); process.exit(1); });
