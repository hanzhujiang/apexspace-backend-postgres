require('dotenv').config({ path: '.env' });
require('dotenv').config({ path: '.env.local' });

const bcrypt = require('bcryptjs');
const { generate: uniqueId } = require('shortid');
const { models, sequelize } = require('../db');
const { NON_OWNER_ROLES } = require('../constants/roles');

// Parse --key=value args
const args = process.argv.slice(2).reduce((acc, arg) => {
  const [key, ...rest] = arg.replace(/^--/, '').split('=');
  acc[key] = rest.join('=');
  return acc;
}, {});

const email = args.email;
const name = args.name || 'Admin';
const surname = args.surname || '';
const password = args.password;

if (!email || !password) {
  console.error('Usage: node src/setup/createAdmin.js --email=<email> --password=<password> [--name=<name>] [--surname=<surname>]');
  process.exit(1);
}

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

async function createAdmin() {
  try {
    await sequelize.authenticate();

    const existing = await models.Admin.findOne({ where: { email, removed: false } });
    if (existing) {
      console.error(`❌ An admin with email "${email}" already exists.`);
      process.exit(1);
    }

    const admin = await models.Admin.create({
      email,
      name,
      surname,
      enabled: true,
      role: 'owner',
    });

    const salt = uniqueId();
    const passwordHash = bcrypt.hashSync(salt + password, 10);

    await models.AdminPassword.create({
      admin_id: admin.id,
      password: passwordHash,
      salt,
      emailVerified: true,
    });

    console.log(`✅ Admin created: ${email}`);

    // Seed permission rows for all non-owner roles (idempotent via findOrCreate)
    for (const role of NON_OWNER_ROLES) {
      await models.Permission.findOrCreate({
        where: { role },
        defaults: { role, permissions: DEFAULT_PERMISSIONS },
      });
    }

    console.log(`✅ Permissions seeded for roles: ${NON_OWNER_ROLES.join(', ')}`);
    process.exit(0);
  } catch (e) {
    console.error('❌ Error creating admin:', e.message);
    console.error(e);
    process.exit(1);
  }
}

createAdmin();
