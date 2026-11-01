require('dotenv').config({ path: '.env' });
require('dotenv').config({ path: '.env.local' });

const { models, sequelize } = require('../db');

async function deleteData() {
  try {
    await sequelize.authenticate();

    // Delete in reverse-FK order so dependent rows go first.
    // Only these 5 tables are touched — business data (sales, invoices,
    // clients, quotes, payments, inventory, warehouses, etc.) is preserved.
    await models.AdminSession.destroy({ where: {}, truncate: false });
    await models.AdminPassword.destroy({ where: {}, truncate: false });
    await models.Admin.destroy({ where: {}, truncate: false });
    console.log('👍 Admin Deleted. To setup demo admin data, run\n\n\t npm run setup\n\n');

    await models.Permission.destroy({ where: {}, truncate: false });
    console.log('👍 Permissions Deleted.');

    await models.Setting.destroy({ where: {}, truncate: false });
    console.log('👍 Setting Deleted. To setup Setting data, run\n\n\t npm run setup\n\n');

    await models.Taxes.destroy({ where: {}, truncate: false });
    console.log('👍 Taxes Deleted.');

    await models.PaymentMode.destroy({ where: {}, truncate: false });
    console.log('👍 PaymentMode Deleted.');

    process.exit(0);
  } catch (e) {
    console.error('❌ Error during reset:', e.message);
    console.error(e);
    process.exit(1);
  }
}

deleteData();
