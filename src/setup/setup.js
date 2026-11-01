require('dotenv').config({ path: '.env' });
require('dotenv').config({ path: '.env.local' });

const bcrypt = require('bcryptjs');
const { globSync } = require('glob');
const fs = require('fs');
const { generate: uniqueId } = require('shortid');
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

async function setupApp() {
  try {
    await sequelize.authenticate();

    // ── Demo admin ───────────────────────────────────────────────────────────
    const demoEmail = 'admin@demo.com';
    const demoPassword = 'admin123';

    const existingAdmin = await models.Admin.findOne({ where: { email: demoEmail, removed: false } });
    if (existingAdmin) {
      console.log(`👍 Demo admin already exists (${demoEmail}), skipping admin creation.`);
    } else {
      const admin = await models.Admin.create({
        email: demoEmail,
        name: 'toblo',
        surname: 'Admin',
        enabled: true,
        role: 'owner',
      });

      const salt = uniqueId();
      const passwordHash = bcrypt.hashSync(salt + demoPassword, 10);

      await models.AdminPassword.create({
        admin_id: admin.id,
        password: passwordHash,
        salt,
        emailVerified: true,
      });

      console.log('👍 Admin created : Done!');
    }

    // ── Permissions ──────────────────────────────────────────────────────────
    for (const role of NON_OWNER_ROLES) {
      await models.Permission.findOrCreate({
        where: { role },
        defaults: { role, permissions: DEFAULT_PERMISSIONS },
      });
    }
    console.log('👍 Permissions seeded : Done!');

    // ── Settings ─────────────────────────────────────────────────────────────
    const settingsFiles = globSync('./src/setup/defaultSettings/**/*.json');
    const allSettings = [];
    for (const filePath of settingsFiles) {
      allSettings.push(...JSON.parse(fs.readFileSync(filePath, 'utf-8')));
    }

    for (const setting of allSettings) {
      const isNumeric =
        setting.valueType === 'Number' ||
        setting.valueType === 'number' ||
        typeof setting.settingValue === 'number';

      const defaults = { ...setting };
      if (isNumeric && typeof setting.settingValue === 'number') {
        defaults.integerValue = setting.settingValue;
      }

      await models.Setting.findOrCreate({
        where: {
          settingCategory: setting.settingCategory,
          settingKey: setting.settingKey,
        },
        defaults,
      });
    }
    console.log('👍 Settings created : Done!');

    // ── Taxes ────────────────────────────────────────────────────────────────
    await models.Taxes.findOrCreate({
      where: { taxName: 'Tax 0%' },
      defaults: { taxName: 'Tax 0%', taxValue: '0', isDefault: true },
    });
    console.log('👍 Taxes created : Done!');

    // ── Payment Modes ────────────────────────────────────────────────────────
    await models.PaymentMode.findOrCreate({
      where: { isDefault: true },
      defaults: {
        name: 'Default Payment',
        description: 'Default Payment Mode (Cash, Wire Transfer)',
        isDefault: true,
      },
    });
    console.log('👍 PaymentMode created : Done!');

    console.log('🥳 Setup completed :Success!');
    process.exit(0);
  } catch (e) {
    console.log('\n🚫 Error! The Error info is below');
    console.log(e);
    process.exit(1);
  }
}

setupApp();
