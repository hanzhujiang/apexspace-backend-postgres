const { models } = require('@/db');

const listAll = async (req, res) => {
  const order = req.query.sort === '1' ? 'ASC' : 'DESC';

  const result = await models.Setting.findAll({
    where: { removed: false, isPrivate: false },
    order: [['id', order]],
  });

  if (result.length > 0) {
    return res.status(200).json({
      success: true,
      result,
      message: 'Successfully found all documents',
    });
  }
  return res.status(203).json({
    success: false,
    result: [],
    message: 'Collection is Empty',
  });
};

module.exports = listAll;
