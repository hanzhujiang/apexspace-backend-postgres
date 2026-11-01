const { models, sequelize } = require('@/db');

const remove = async (req, res) => {
  const deletedInvoice = await models.Invoice.findOne({
    where: { id: req.params.id, removed: false },
  });

  if (!deletedInvoice) {
    return res.status(404).json({
      success: false,
      result: null,
      message: 'Invoice not found',
    });
  }

  await sequelize.transaction(async (t) => {
    await deletedInvoice.update({ removed: true }, { transaction: t });

    // Cascade soft-delete to items, files and payments associated with the invoice.
    await models.InvoiceItem.destroy({
      where: { invoice_id: deletedInvoice.id },
      transaction: t,
    });
    await models.InvoiceFile.destroy({
      where: { invoice_id: deletedInvoice.id },
      transaction: t,
    });
    await models.Payment.update(
      { removed: true },
      { where: { invoice_id: deletedInvoice.id }, transaction: t }
    );
  });

  return res.status(200).json({
    success: true,
    result: deletedInvoice,
    message: 'Invoice deleted successfully',
  });
};

module.exports = remove;
