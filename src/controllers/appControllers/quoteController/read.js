const { models } = require('@/db');

const read = async (req, res) => {
  const result = await models.Quote.findOne({
    where: { id: req.params.id, removed: false },
    include: [
      { model: models.QuoteItem, as: 'items' },
      { model: models.QuoteFile, as: 'files' },
      { model: models.Client, as: 'client' },
      { model: models.Admin, as: 'createdBy', attributes: ['id', 'name'] },
    ],
  });

  if (!result) {
    return res.status(404).json({
      success: false,
      result: null,
      message: 'No document found ',
    });
  }

  return res.status(200).json({
    success: true,
    result,
    message: 'we found this document ',
  });
};

module.exports = read;
