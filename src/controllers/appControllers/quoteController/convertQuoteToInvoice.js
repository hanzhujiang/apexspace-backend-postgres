const { models, sequelize } = require('@/db');
const { increaseBySettingKey } = require('@/middlewares/settings');
const { currentYear } = require('@/utils/dateTime');

const convertQuoteToInvoice = async (req, res) => {
  const quoteId = req.params.id;

  try {
    const invoice = await sequelize.transaction(async (t) => {
      const quote = await models.Quote.findOne({
        where: { id: quoteId, removed: false },
        include: [{ model: models.QuoteItem, as: 'items' }],
        transaction: t,
      });

      if (!quote) {
        const err = new Error('Quote not found');
        err.status = 404;
        throw err;
      }

      if (quote.converted) {
        const err = new Error('Quote has already been converted to an invoice');
        err.status = 409;
        throw err;
      }

      // Next invoice number is derived from the actual DB max for the year,
      // not from last_invoice_number (which can drift and cause unique-constraint collisions).
      const year = currentYear(req.userTz);
      const maxRow = await models.Invoice.findOne({
        where: { year },
        attributes: [[sequelize.fn('MAX', sequelize.col('number')), 'maxNumber']],
        raw: true,
        transaction: t,
      });
      const nextNumber = (Number(maxRow?.maxNumber) || 0) + 1;

      const newInvoice = await models.Invoice.create(
        {
          number: nextNumber,
          year,
          client_id: quote.client_id,
          createdBy_id: quote.createdBy_id,
          date: quote.date,
          expiredDate: quote.expiredDate,
          subTotal: quote.subTotal,
          taxRate: quote.taxRate,
          taxTotal: quote.taxTotal,
          total: quote.total,
          discount: quote.discount,
          currency: quote.currency,
          status: 'draft',
          paymentStatus: 'unpaid',
          converted_from: 'quote',
          converted_quote_id: quote.id,
          notes: quote.notes,
          removed: false,
        },
        { transaction: t }
      );

      if (quote.items && quote.items.length > 0) {
        await models.InvoiceItem.bulkCreate(
          quote.items.map((i) => ({
            invoice_id: newInvoice.id,
            itemName: i.itemName,
            description: i.description,
            quantity: i.quantity,
            price: i.price,
            total: i.total,
          })),
          { transaction: t }
        );
      }

      const fileId = 'invoice-' + newInvoice.id + '.pdf';
      await newInvoice.update({ pdf: fileId }, { transaction: t });

      await quote.update({ converted: true }, { transaction: t });

      return newInvoice;
    });

    increaseBySettingKey({ settingKey: 'last_invoice_number' });

    const result = await models.Invoice.findOne({
      where: { id: invoice.id },
      include: [
        { model: models.InvoiceItem, as: 'items' },
        { model: models.Client, as: 'client' },
        { model: models.Admin, as: 'createdBy', attributes: ['id', 'name'] },
      ],
    });

    return res.status(200).json({
      success: true,
      result,
      message: 'Quote converted to invoice successfully',
    });
  } catch (e) {
    if (e.status) {
      return res.status(e.status).json({
        success: false,
        result: null,
        message: e.message,
      });
    }
    throw e;
  }
};

module.exports = convertQuoteToInvoice;
