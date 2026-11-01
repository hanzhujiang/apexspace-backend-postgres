const { models, sequelize } = require('@/db');

const custom = require('@/controllers/pdfController');

const { calculate } = require('@/helpers');
const schema = require('./schemaValidate');

const update = async (req, res) => {
  let body = req.body;

  const { error, value } = schema.validate(body);
  if (error) {
    const { details } = error;
    return res.status(400).json({
      success: false,
      result: null,
      message: details[0]?.message,
    });
  }

  const previousInvoice = await models.Invoice.findOne({
    where: { id: req.params.id, removed: false },
  });

  if (!previousInvoice) {
    return res.status(404).json({
      success: false,
      result: null,
      message: 'Invoice not found',
    });
  }

  const credit = parseFloat(previousInvoice.credit) || 0;

  const { items = [], taxRate = 0, discount = 0 } = req.body;

  if (items.length === 0) {
    return res.status(400).json({
      success: false,
      result: null,
      message: 'Items cannot be empty',
    });
  }

  // default
  let subTotal = 0;
  let taxTotal = 0;
  let total = 0;

  //Calculate the items array with subTotal, total, taxTotal
  items.map((item) => {
    let total = calculate.multiply(item['quantity'], item['price']);
    //sub total
    subTotal = calculate.add(subTotal, total);
    //item total
    item['total'] = total;
  });
  taxTotal = calculate.multiply(subTotal, taxRate / 100);
  total = calculate.add(subTotal, taxTotal);

  let paymentStatus =
    calculate.sub(total, discount) === credit ? 'paid' : credit > 0 ? 'partially' : 'unpaid';

  // Map Mongoose-style refs to Sequelize FK columns.
  const clientId =
    body.client && typeof body.client === 'object' ? body.client.id : body.client;

  const updatePayload = {
    ...body,
    client_id: clientId,
    subTotal,
    taxTotal,
    total,
    paymentStatus,
    pdf: 'invoice-' + req.params.id + '.pdf',
  };
  delete updatePayload.client;
  delete updatePayload.createdBy;
  delete updatePayload.items;
  if (updatePayload.hasOwnProperty('currency')) {
    delete updatePayload.currency;
  }

  const result = await sequelize.transaction(async (t) => {
    await models.Invoice.update(updatePayload, {
      where: { id: req.params.id, removed: false },
      transaction: t,
    });

    // Replace invoice items wholesale (simpler than diffing).
    await models.InvoiceItem.destroy({
      where: { invoice_id: req.params.id },
      transaction: t,
    });
    await models.InvoiceItem.bulkCreate(
      items.map((item) => ({
        itemName: item.itemName,
        description: item.description,
        quantity: item.quantity,
        price: item.price,
        total: item.total,
        invoice_id: req.params.id,
      })),
      { transaction: t }
    );

    return models.Invoice.findOne({
      where: { id: req.params.id },
      include: [{ model: models.InvoiceItem, as: 'items' }],
      transaction: t,
    });
  });

  // Returning successfull response

  return res.status(200).json({
    success: true,
    result,
    message: 'we update this document ',
  });
};

module.exports = update;
