const { models } = require('@/db');

const updateBySettingKey = async (req, res) => {
  const settingKey = req.params.settingKey || undefined;

  if (!settingKey) {
    return res.status(202).json({
      success: false,
      result: null,
      message: 'No settingKey provided ',
    });
  }

  const { settingValue } = req.body;

  if (!settingValue) {
    return res.status(202).json({
      success: false,
      result: null,
      message: 'No settingValue provided ',
    });
  }

  const [affectedCount, updatedRows] = await models.Setting.update(
    { settingValue },
    { where: { settingKey }, returning: true }
  );

  if (!affectedCount) {
    return res.status(404).json({
      success: false,
      result: null,
      message: 'No document found by this settingKey: ' + settingKey,
    });
  }

  const result =
    (updatedRows && updatedRows[0]) ||
    (await models.Setting.findOne({ where: { settingKey } }));

  return res.status(200).json({
    success: true,
    result,
    message: 'we update this document by this settingKey: ' + settingKey,
  });
};

module.exports = updateBySettingKey;
