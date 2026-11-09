const { models, sequelize } = require('@/db');

const { calculate } = require('@/helpers');
const { increaseBySettingKey } = require('@/middlewares/settings');
const { currentYear } = require('@/utils/dateTime');
const schema = require('./schemaValidate');

const create = async (req, res) => {
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

  const { items = [], taxRate = 0, discount = 0 } = value;

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

  let paymentStatus = calculate.sub(total, discount) === 0 ? 'paid' : 'unpaid';

  // Map Mongoose-style refs to Sequelize FK columns.
  const clientId =
    body.client && typeof body.client === 'object' ? body.client.id : body.client;

  const invoicePayload = {
    ...body,
    client_id: clientId,
    createdBy_id: req.admin.id,
    subTotal,
    taxTotal,
    total,
    paymentStatus,
  };
  delete invoicePayload.client;
  delete invoicePayload.createdBy;
  delete invoicePayload.items;

  const result = await sequelize.transaction(async (t) => {
    // Derive (number, year) authoritatively from the DB to avoid drift with the
    // last_invoice_number setting the frontend uses to suggest a default.
    const year = Number(invoicePayload.year) || currentYear(req.userTz);
    const maxRow = await models.Invoice.findOne({
      where: { year },
      attributes: [[sequelize.fn('MAX', sequelize.col('number')), 'maxNumber']],
      raw: true,
      transaction: t,
    });
    invoicePayload.year = year;
    invoicePayload.number = (Number(maxRow?.maxNumber) || 0) + 1;

    const invoice = await models.Invoice.create(invoicePayload, { transaction: t });
    await invoice.update({ pdf: 'invoice-' + invoice.id + '.pdf' }, { transaction: t });

    if (items.length > 0) {
      await models.InvoiceItem.bulkCreate(
        items.map((item) => ({
          itemName: item.itemName,
          description: item.description,
          quantity: item.quantity,
          price: item.price,
          total: item.total,
          invoice_id: invoice.id,
        })),
        { transaction: t }
      );
    }

    return models.Invoice.findOne({
      where: { id: invoice.id },
      include: [{ model: models.InvoiceItem, as: 'items' }],
      transaction: t,
    });
  });

  increaseBySettingKey({
    settingKey: 'last_invoice_number',
  });

  // Returning successfull response
  return res.status(200).json({
    success: true,
    result,
    message: 'Invoice created successfully',
  });
};

module.exports = create;
