const { models, Op } = require('@/db');

const listBySettingKey = async (req, res) => {
  const settingKeyArray = req.query.settingKeyArray ? req.query.settingKeyArray.split(',') : [];

  if (settingKeyArray.length === 0) {
    return res.status(202).json({
      success: false,
      result: [],
      message: 'Please provide settings you need',
    });
  }

  const results = await models.Setting.findAll({
    where: {
      settingKey: { [Op.in]: settingKeyArray },
      removed: false,
    },
  });

  if (results.length >= 1) {
    return res.status(200).json({
      success: true,
      result: results,
      message: 'Successfully found all documents',
    });
  }
  return res.status(202).json({
    success: false,
    result: [],
    message: 'No document found by this request',
  });
};

module.exports = listBySettingKey;
