const { models, sequelize } = require('@/db');

const { calculate } = require('@/helpers');

const update = async (req, res) => {
  const body = req.body || {};
  const { items = [], taxRate = 0, discount = 0 } = body;

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

  const updateFields = {
    number: body.number,
    year: body.year,
    content: body.content,
    recurring: body.recurring,
    date: body.date,
    expiredDate: body.expiredDate,
    client_id: body.client_id || body.client,
    taxRate,
    subTotal,
    taxTotal,
    total,
    discount,
    status: body.status,
    approved: body.approved,
    isExpired: body.isExpired,
    notes: body.notes,
    pdf: 'quote-' + req.params.id + '.pdf',
    updated: new Date(),
  };

  // Strip undefined so we don't overwrite existing columns with null
  Object.keys(updateFields).forEach((k) => updateFields[k] === undefined && delete updateFields[k]);

  // currency must not be modified on update (match Mongoose behavior)
  delete updateFields.currency;

  const result = await sequelize.transaction(async (t) => {
    const [count] = await models.Quote.update(updateFields, {
      where: { id: req.params.id, removed: false },
      transaction: t,
    });

    if (!count) return null;

    // Replace items (delete + recreate)
    await models.QuoteItem.destroy({ where: { quote_id: req.params.id }, transaction: t });
    await models.QuoteItem.bulkCreate(
      items.map((i) => ({
        quote_id: req.params.id,
        itemName: i.itemName,
        description: i.description,
        quantity: i.quantity,
        price: i.price,
        total: i.total,
      })),
      { transaction: t }
    );

    return models.Quote.findOne({
      where: { id: req.params.id },
      include: [
        { model: models.QuoteItem, as: 'items' },
        { model: models.Admin, as: 'createdBy', attributes: ['id', 'name'] },
      ],
      transaction: t,
    });
  });

  if (!result) {
    return res.status(404).json({
      success: false,
      result: null,
      message: 'No document found',
    });
  }

  return res.status(200).json({
    success: true,
    result,
    message: 'we update this document ',
  });
};

module.exports = update;
