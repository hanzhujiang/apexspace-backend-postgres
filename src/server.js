require('module-alias/register');

const [major] = process.versions.node.split('.').map(parseFloat);
if (major < 20) {
  console.log('Please upgrade node.js to v20 or greater.');
  process.exit();
}

require('dotenv').config({ path: '.env' });
require('dotenv').config({ path: '.env.local' });

const { sequelize, syncDatabase } = require('@/db');

async function start() {
  try {
    await sequelize.authenticate();
    console.log('PostgreSQL connection established.');

    // Sync schema (alter: true is safe for iterative dev; use migrations for production)
    await syncDatabase({ alter: process.env.NODE_ENV !== 'production' });

    const app = require('./app');
    app.set('port', process.env.PORT || 8888);
    const server = app.listen(app.get('port'), () => {
      console.log(`Express running → PORT ${server.address().port}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error.message);
    process.exit(1);
  }
}

start();
