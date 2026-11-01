require('dotenv').config({ path: '.env' });
require('dotenv').config({ path: '.env.local' });
const { globSync } = require('glob');
const fs = require('fs');
const Joi = require('joi');
const bcrypt = require('bcryptjs');
const { generate: uniqueId } = require('shortid');

const { models, sequelize } = require('@/db');

const setup = async (req, res) => {
  const { name, email, password, language, timezone, country, config = {} } = req.body;

  const objectSchema = Joi.object({
    name: Joi.string().required(),
    email: Joi.string()
      .email({ tlds: { allow: true } })
      .required(),
    password: Joi.string().required(),
  });

  const { error } = objectSchema.validate({ name, email, password });
  if (error) {
    return res.status(409).json({
      success: false,
      result: null,
      error,
      message: 'Invalid/Missing credentials.',
      errorMessage: error.message,
    });
  }

  const t = await sequelize.transaction();
  try {
    const salt = uniqueId();
    const passwordHash = bcrypt.hashSync(salt + password, 10);

    const admin = await models.Admin.create(
      { email, name, role: 'owner', enabled: true },
      { transaction: t }
    );

    await models.AdminPassword.create(
      {
        admin_id: admin.id,
        password: passwordHash,
        salt,
        emailVerified: true,
        authType: 'email',
      },
      { transaction: t }
    );

    const settingsFiles = globSync('./src/setup/defaultSettings/**/*.json');
    const overrides = {
      idurar_app_email: email,
      idurar_app_company_email: email,
      idurar_app_timezone: timezone,
      idurar_app_country: country,
      idurar_app_language: language || 'en_us',
    };

    for (const filePath of settingsFiles) {
      const rows = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      for (const row of rows) {
        const settingValue = overrides[row.settingKey] ?? row.settingValue;
        const isNumeric = row.valueType === 'Number' || typeof settingValue === 'number';
        await models.Setting.findOrCreate({
          where: { settingKey: row.settingKey, settingCategory: row.settingCategory },
          defaults: {
            ...row,
            settingValue,
            integerValue: isNumeric ? parseInt(settingValue) : null,
          },
          transaction: t,
        });
      }
    }

    await models.Taxes.findOrCreate({
      where: { taxName: 'Tax 0%' },
      defaults: { taxName: 'Tax 0%', taxValue: 0, isDefault: true, enabled: true },
      transaction: t,
    });

    await models.PaymentMode.findOrCreate({
      where: { name: 'Default Payment' },
      defaults: {
        name: 'Default Payment',
        description: 'Default Payment Mode (Cash , Wire Transfert)',
        isDefault: true,
        enabled: true,
      },
      transaction: t,
    });

    await t.commit();
    return res.status(200).json({
      success: true,
      result: {},
      message: 'Successfully IDURAR App Setup',
    });
  } catch (err) {
    await t.rollback();
    return res.status(500).json({
      success: false,
      result: null,
      message: err.message,
    });
  }
};

module.exports = setup;
