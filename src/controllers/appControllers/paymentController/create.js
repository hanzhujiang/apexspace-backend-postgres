const { models, sequelize } = require('@/db');

const { calculate } = require('@/helpers');
const { increaseBySettingKey } = require('@/middlewares/settings');

const create = async (req, res) => {
  const body = req.body || {};
  const invoiceId = body.invoice_id || body.invoice;
  const amount = Number(body.amount);

  if (!amount || amount === 0) {
    return res.status(202).json({
      success: false,
      result: null,
      message: `The Minimum Amount couldn't be 0`,
    });
  }

  const result = await sequelize.transaction(async (t) => {
    const currentInvoice = await models.Invoice.findOne({
      where: { id: invoiceId, removed: false },
      transaction: t,
    });

    if (!currentInvoice) {
      const err = new Error('Invoice not found');
      err.status = 404;
      throw err;
    }

    const previousTotal = Number(currentInvoice.total);
    const previousDiscount = Number(currentInvoice.discount);
    const previousCredit = Number(currentInvoice.credit);

    const maxAmount = calculate.sub(
      calculate.sub(previousTotal, previousDiscount),
      previousCredit
    );

    if (amount > maxAmount) {
      const err = new Error(`The Max Amount you can add is ${maxAmount}`);
      err.status = 202;
      throw err;
    }

    const payment = await models.Payment.create(
      {
        number: body.number,
        date: body.date,
        amount,
        currency: body.currency,
        ref: body.ref,
        description: body.description,
        invoice_id: invoiceId,
        client_id: body.client_id || body.client,
        paymentMode_id: body.paymentMode_id || body.paymentMode,
        createdBy_id: req.admin.id,
        removed: false,
      },
      { transaction: t }
    );

    const newCredit = calculate.add(previousCredit, amount);
    let paymentStatus =
      calculate.sub(previousTotal, previousDiscount) === newCredit
        ? 'paid'
        : newCredit > 0
        ? 'partially'
        : 'unpaid';

    await currentInvoice.update(
      { credit: newCredit, paymentStatus },
      { transaction: t }
    );

    return payment;
  }).catch((e) => {
    if (e.status) return { __error: e };
    throw e;
  });

  if (result && result.__error) {
    return res.status(result.__error.status).json({
      success: false,
      result: null,
      message: result.__error.message,
    });
  }

  increaseBySettingKey({ settingKey: 'last_payment_number' });

  const full = await models.Payment.findOne({
    where: { id: result.id },
    include: [
      { model: models.Invoice, as: 'invoice' },
      { model: models.Client, as: 'client' },
      { model: models.Admin, as: 'createdBy', attributes: ['id', 'name'] },
      { model: models.PaymentMode, as: 'paymentMode' },
    ],
  });

  return res.status(200).json({
    success: true,
    result: full,
    message: 'Payment Invoice created successfully',
  });
};

module.exports = create;
