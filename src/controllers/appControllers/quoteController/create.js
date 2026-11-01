const { models, sequelize } = require('@/db');

const { calculate } = require('@/helpers');
const { increaseBySettingKey } = require('@/middlewares/settings');

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

  const quoteFields = {
    number: body.number,
    year: body.year,
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
