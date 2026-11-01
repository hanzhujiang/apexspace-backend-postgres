const { models } = require('@/db');

const updateBySettingKey = async ({ settingKey, settingValue }) => {
  try {
    if (!settingKey || settingValue === undefined || settingValue === null) {
      return null;
    }

    const [affectedCount, affectedRows] = await models.Setting.update(
      { settingValue },
      { where: { settingKey }, returning: true }
    );

    if (!affectedCount) {
      return null;
    }

    const updated = Array.isArray(affectedRows) ? affectedRows[0] : null;
    if (updated) {
      return updated;
    }

    // Fallback for dialects that do not support RETURNING
    const result = await models.Setting.findOne({ where: { settingKey } });
    if (!result) {
      return null;
    }
    return result;
  } catch {
    return null;
  }
};

module.exports = updateBySettingKey;
