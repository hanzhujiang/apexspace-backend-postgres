const { models } = require('@/db');

const readBySettingKey = async ({ settingKey }) => {
  try {
    // Find document by settingKey

    if (!settingKey) {
      return null;
    }

    const result = await models.Setting.findOne({ where: { settingKey } });
    // If no results found, return null
    if (!result) {
      return null;
    } else {
      // Return success response
      return result;
    }
  } catch {
    return null;
  }
};

module.exports = readBySettingKey;
