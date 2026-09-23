require('dotenv').config({ path: '.env' });
require('dotenv').config({ path: '.env.local' });

const { generate: uniqueId } = require('shortid');
const mongoose = require('mongoose');

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

async function createAdmin() {
  await mongoose.connect(process.env.DATABASE);

  try {
    const Admin = require('../models/coreModels/Admin');
    const AdminPassword = require('../models/coreModels/AdminPassword');

    const existing = await Admin.findOne({ email, removed: false });
    if (existing) {
      console.error(`❌ An admin with email "${email}" already exists.`);
      process.exit(1);
    }

    const result = await new Admin({ email, name, surname, enabled: true, role: 'owner' }).save();

    const newAdminPassword = new AdminPassword();
    const salt = uniqueId();
    const passwordHash = newAdminPassword.generateHash(salt, password);

    await new AdminPassword({
      password: passwordHash,
      salt,
      emailVerified: true,
      user: result._id,
    }).save();

    console.log(`✅ Admin created: ${email}`);
  } catch (e) {
    console.error('❌ Error creating admin:', e.message);
  } finally {
    process.exit();
  }
}

createAdmin();
