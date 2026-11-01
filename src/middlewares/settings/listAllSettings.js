const { models } = require('@/db');

const listAllSettings = async () => {
  try {
    //  Query the database for a list of all results
    const result = await models.Setting.findAll({
      where: { removed: false },
    });

    if (result.length > 0) {
      return result;
    } else {
      return [];
    }
  } catch {
    return [];
  }
};

module.exports = listAllSettings;
