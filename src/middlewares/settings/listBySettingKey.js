const { models, Op } = require('@/db');

const listBySettingKey = async ({ settingKeyArray = [] }) => {
  try {
    if (settingKeyArray.length === 0) {
      return [];
    }

    const results = await models.Setting.findAll({
      where: {
        settingKey: { [Op.in]: settingKeyArray },
        removed: false,
      },
    });

    // If no results found, return empty array
    if (results.length >= 1) {
      return results;
    } else {
      return [];
    }
  } catch {
    return [];
  }
};

module.exports = listBySettingKey;
