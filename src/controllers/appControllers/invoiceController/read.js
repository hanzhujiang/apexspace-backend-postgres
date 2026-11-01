const { models } = require('@/db');

const read = async (req, res) => {
  // Find document by id
  const result = await models.Invoice.findOne({
    where: { id: req.params.id, removed: false },
    include: [
      { model: models.Admin, as: 'createdBy', attributes: ['id', 'name'] },
      { model: models.Client, as: 'client' },
      { model: models.InvoiceItem, as: 'items' },
      { model: models.Payment, as: 'payment' },
    ],
  });
  // If no results found, return document not found
  if (!result) {
    return res.status(404).json({
      success: false,
      result: null,
      message: 'No document found ',
    });
  } else {
    // Return success resposne
    return res.status(200).json({
      success: true,
      result,
      message: 'we found this document ',
    });
  }
};

module.exports = read;
