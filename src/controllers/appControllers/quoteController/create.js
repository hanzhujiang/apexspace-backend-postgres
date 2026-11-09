const { models, sequelize } = require('@/db');

const { calculate } = require('@/helpers');
const { increaseBySettingKey } = require('@/middlewares/settings');
const { currentYear } = require('@/utils/dateTime');

const create = async (req, res) => {
  const body = req.body || {};
  const { items = [], taxRate = 0, discount = 0 } = body;

  // default
  let subTotal = 0;
  let taxTotal = 0;
  let total = 0;

  // Calculate the items array with subTotal, total, taxTotal
  items.map((item) => {
    const itemTotal = calculate.multiply(item['quantity'], item['price']);
    // sub total
    subTotal = calculate.add(subTotal, itemTotal);
    // item total
    item['total'] = itemTotal;
  });
  taxTotal = calculate.multiply(subTotal, taxRate / 100);
  total = calculate.add(subTotal, taxTotal);

  const requestedYear = Number(body.year) || currentYear(req.userTz);

  const quoteFields = {
    year: requestedYear,
    content: body.content,
    recurring: body.recurring,
    date: body.date,
    expiredDate: body.expiredDate,
    client_id: body.client_id || body.client,
    createdBy_id: req.admin.id,
    taxRate,
    subTotal,
    taxTotal,
    total,
    discount,
    currency: body.currency,
    status: body.status,
    approved: body.approved,
    isExpired: body.isExpired,
    notes: body.notes,
    removed: false,
  };

  const result = await sequelize.transaction(async (t) => {
    // Next quote number comes from the DB (MAX for the year +1), not from
    // last_quote_number which can drift and violate the (number, year) unique index.
    const maxRow = await models.Quote.findOne({
      where: { year: requestedYear },
      attributes: [[sequelize.fn('MAX', sequelize.col('number')), 'maxNumber']],
      raw: true,
      transaction: t,
    });
    quoteFields.number = (Number(maxRow?.maxNumber) || 0) + 1;

    const quote = await models.Quote.create(quoteFields, { transaction: t });

    if (items.length > 0) {
      await models.QuoteItem.bulkCreate(
        items.map((i) => ({
          quote_id: quote.id,
          itemName: i.itemName,
          description: i.description,
          quantity: i.quantity,
          price: i.price,
          total: i.total,
        })),
        { transaction: t }
      );
    }

    const fileId = 'quote-' + quote.id + '.pdf';
    await quote.update({ pdf: fileId }, { transaction: t });
    return quote;
  });

  increaseBySettingKey({ settingKey: 'last_quote_number' });

  const updateResult = await models.Quote.findOne({
    where: { id: result.id },
    include: [
      { model: models.QuoteItem, as: 'items' },
      { model: models.Admin, as: 'createdBy', attributes: ['id', 'name'] },
    ],
  });

  return res.status(200).json({
    success: true,
    result: updateResult,
    message: 'Quote created successfully',
  });
};

module.exports = create;
