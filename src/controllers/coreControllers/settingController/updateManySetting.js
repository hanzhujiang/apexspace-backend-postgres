const { models, sequelize } = require('@/db');

const updateManySetting = async (req, res) => {
  const { settings } = req.body;

  if (!settings || settings.length === 0) {
    return res.status(202).json({
      success: false,
      result: null,
      message: 'No settings provided ',
    });
  }

  const hasError = settings.some(
    (s) => !s.hasOwnProperty('settingKey') || !s.hasOwnProperty('settingValue')
  );
  if (hasError) {
    return res.status(202).json({
      success: false,
      result: null,
      message: 'Settings provided has Error',
    });
  }

  let totalMatched = 0;
  await sequelize.transaction(async (t) => {
    for (const { settingKey, settingValue } of settings) {
      const [count] = await models.Setting.update(
        { settingValue },
        { where: { settingKey }, transaction: t }
      );
      totalMatched += count;
    }
  });

  if (totalMatched < 1) {
    return res.status(404).json({
      success: false,
      result: null,
      message: 'No settings found by to update',
    });
  }

  return res.status(200).json({
    success: true,
    result: [],
    message: 'we update all settings',
  });
};

module.exports = updateManySetting;
