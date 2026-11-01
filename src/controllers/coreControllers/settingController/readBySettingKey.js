const { models } = require('@/db');

const readBySettingKey = async (req, res) => {
  const settingKey = req.params.settingKey || undefined;

  if (!settingKey) {
    return res.status(202).json({
      success: false,
      result: null,
      message: 'No settingKey provided ',
    });
  }

  const result = await models.Setting.findOne({ where: { settingKey } });

  if (!result) {
    return res.status(404).json({
      success: false,
      result: null,
      message: 'No document found by this settingKey: ' + settingKey,
    });
  }
  return res.status(200).json({
    success: true,
    result,
    message: 'we found this document by this settingKey: ' + settingKey,
  });
};

module.exports = readBySettingKey;
