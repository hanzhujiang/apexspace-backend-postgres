const { models } = require('@/db');

const increaseBySettingKey = async ({ settingKey }) => {
  try {
    if (!settingKey) {
      return null;
    }

    const [affected] = await models.Setting.increment('integerValue', {
      by: 1,
      where: { settingKey },
    });

    // Sequelize .increment() returns [affectedRows, affectedCount]; shape varies by dialect.
    // Detect "no row matched" to preserve the Mongoose "null on miss" contract.
    const affectedCount = Array.isArray(affected) ? affected.length : affected;
    if (!affectedCount) {
      return null;
    }

    const result = await models.Setting.findOne({ where: { settingKey } });
    if (!result) {
      return null;
    }
    return result;
  } catch {
    return null;
  }
};

module.exports = increaseBySettingKey;
