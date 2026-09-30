require('dotenv').config({ path: '.env' });
require('dotenv').config({ path: '.env.local' });

const { globSync } = require('glob');
const fs = require('fs');
const mongoose = require('mongoose');

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
  await mongoose.connect(process.env.DATABASE);
  console.log('🔌 Connected to database');

  try {
    // ── Permissions ──────────────────────────────────────────────────────────
    const Permission = require('../models/coreModels/Permission');
    const { NON_OWNER_ROLES } = require('../constants/roles');

    await Promise.all(
      NON_OWNER_ROLES.map((role) =>
        Permission.findOneAndUpdate(
          { role },
          { $setOnInsert: { permissions: DEFAULT_PERMISSIONS } },
          { upsert: true, new: true }
        )
      )
    );
    console.log(`✅ Permissions seeded for roles: ${NON_OWNER_ROLES.join(', ')}`);

    // ── Settings ─────────────────────────────────────────────────────────────
    const Setting = require('../models/coreModels/Setting');

    const settingFiles = globSync('./src/setup/defaultSettings/**/*.json');
    const allSettings = settingFiles.flatMap((filePath) =>
      JSON.parse(fs.readFileSync(filePath, 'utf-8'))
    );

    let settingsInserted = 0;
    for (const setting of allSettings) {
      const exists = await Setting.findOne({ settingKey: setting.settingKey });
      if (!exists) {
        await new Setting(setting).save();
        settingsInserted++;
      }
    }
    console.log(`✅ Settings: ${settingsInserted} inserted, ${allSettings.length - settingsInserted} already existed`);

    // ── Taxes ─────────────────────────────────────────────────────────────────
    const Taxes = require('../models/appModels/Taxes');

    const taxExists = await Taxes.findOne({ taxName: 'Tax 0%' });
    if (!taxExists) {
      await Taxes.create({ taxName: 'Tax 0%', taxValue: '0', isDefault: true });
      console.log('✅ Default tax created');
    } else {
      console.log('✅ Default tax already exists, skipped');
    }

    // ── Payment Modes ─────────────────────────────────────────────────────────
    const PaymentMode = require('../models/appModels/PaymentMode');

    const paymentModeExists = await PaymentMode.findOne({ isDefault: true });
    if (!paymentModeExists) {
      await PaymentMode.create({
        name: 'Default Payment',
        description: 'Default Payment Mode (Cash, Wire Transfer)',
        isDefault: true,
      });
      console.log('✅ Default payment mode created');
    } else {
      console.log('✅ Default payment mode already exists, skipped');
    }

    console.log('\n🥳 Database setup complete!');
  } catch (e) {
    console.error('❌ Error during DB setup:', e.message);
    console.error(e);
  } finally {
    process.exit();
  }
}

setupDb();
