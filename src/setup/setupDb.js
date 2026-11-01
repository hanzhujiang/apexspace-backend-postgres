require('dotenv').config({ path: '.env' });
require('dotenv').config({ path: '.env.local' });

const { globSync } = require('glob');
const fs = require('fs');
const { models, sequelize } = require('../db');
const { NON_OWNER_ROLES } = require('../constants/roles');

const DEFAULT_PERMISSIONS = {
  dashboard:      true,
  customer:       true,
  invoice:        true,
  quote:          true,
  payment:        true,
  paymentMode:    true,
  taxes:          true,
  sales:          true,
  toolings:       true,
  inventory:      true,
  warehouse:      true,
  productCosts:   true,
  settings:       false,
  salesAssistant: true,
};

async function setupDb() {
  try {
    await sequelize.authenticate();
    console.log('🔌 Connected to database');

    // ── Permissions ──────────────────────────────────────────────────────────
    for (const role of NON_OWNER_ROLES) {
      await models.Permission.findOrCreate({
        where: { role },
        defaults: { role, permissions: DEFAULT_PERMISSIONS },
      });
    }
    console.log(`✅ Permissions seeded for roles: ${NON_OWNER_ROLES.join(', ')}`);

    // ── Settings ─────────────────────────────────────────────────────────────
    const settingFiles = globSync('./src/setup/defaultSettings/**/*.json');
    const allSettings = settingFiles.flatMap((filePath) =>
      JSON.parse(fs.readFileSync(filePath, 'utf-8'))
    );

    let settingsInserted = 0;
    for (const setting of allSettings) {
      const isNumeric =
        setting.valueType === 'Number' ||
        setting.valueType === 'number' ||
        typeof setting.settingValue === 'number';

      const defaults = { ...setting };
      if (isNumeric && typeof setting.settingValue === 'number') {
        defaults.integerValue = setting.settingValue;
      }

      const [, created] = await models.Setting.findOrCreate({
        where: {
          settingCategory: setting.settingCategory,
          settingKey: setting.settingKey,
        },
        defaults,
      });
      if (created) settingsInserted++;
    }
    console.log(`✅ Settings: ${settingsInserted} inserted, ${allSettings.length - settingsInserted} already existed`);

    // ── Taxes ─────────────────────────────────────────────────────────────────
    const [, taxCreated] = await models.Taxes.findOrCreate({
      where: { taxName: 'Tax 0%' },
      defaults: { taxName: 'Tax 0%', taxValue: '0', isDefault: true },
    });
    console.log(taxCreated ? '✅ Default tax created' : '✅ Default tax already exists, skipped');

    // ── Payment Modes ─────────────────────────────────────────────────────────
    const [, pmCreated] = await models.PaymentMode.findOrCreate({
      where: { isDefault: true },
      defaults: {
        name: 'Default Payment',
        description: 'Default Payment Mode (Cash, Wire Transfer)',
        isDefault: true,
      },
    });
    console.log(pmCreated ? '✅ Default payment mode created' : '✅ Default payment mode already exists, skipped');

    console.log('\n🥳 Database setup complete!');
    process.exit(0);
  } catch (e) {
    console.error('❌ Error during DB setup:', e.message);
    console.error(e);
    process.exit(1);
  }
}

setupDb();
