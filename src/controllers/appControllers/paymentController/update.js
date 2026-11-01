const { models, sequelize } = require('@/db');

const { calculate } = require('@/helpers');

const update = async (req, res) => {
  const body = req.body || {};
  const currentAmount = Number(body.amount);

  if (currentAmount === 0) {
    return res.status(202).json({
      success: false,
      result: null,
      message: `The Minimum Amount couldn't be 0`,
    });
  }

  const outcome = await sequelize.transaction(async (t) => {
    const previousPayment = await models.Payment.findOne({
      where: { id: req.params.id, removed: false },
      transaction: t,
    });

    if (!previousPayment) {
      return { __error: { status: 404, message: 'No document found' } };
    }

    const invoice = await models.Invoice.findOne({
      where: { id: previousPayment.invoice_id },
      transaction: t,
    });

    if (!invoice) {
      return { __error: { status: 404, message: 'Invoice not found' } };
    }

    const previousAmount = Number(previousPayment.amount);
    const total = Number(invoice.total);
    const discount = Number(invoice.discount);
    const previousCredit = Number(invoice.credit);

    const changedAmount = calculate.sub(currentAmount, previousAmount);
    // maxAmount reflects remaining headroom relative to credit excluding this payment
    const maxAmount = calculate.sub(total, calculate.add(discount, previousCredit));

    if (changedAmount > maxAmount) {
      return {
        __error: {
          status: 202,
          message: `The Max Amount you can add is ${maxAmount + previousAmount}`,
        },
      };
    }

    const newCreditSum = calculate.add(previousCredit, changedAmount);
    const paymentStatus =
      calculate.sub(total, discount) === newCreditSum
        ? 'paid'
        : newCreditSum > 0
        ? 'partially'
        : 'unpaid';

    const updates = {
      number: body.number,
      date: body.date,
      amount: currentAmount,
      paymentMode_id: body.paymentMode_id || body.paymentMode,
      ref: body.ref,
      description: body.description,
      updated: new Date(),
    };
    Object.keys(updates).forEach((k) => updates[k] === undefined && delete updates[k]);

    await previousPayment.update(updates, { transaction: t });

    // Atomic increment on invoice credit, then set paymentStatus
    await invoice.increment('credit', { by: changedAmount, transaction: t });
    await invoice.update({ paymentStatus }, { transaction: t });

    return { paymentId: previousPayment.id };
  });

  if (outcome && outcome.__error) {
    return res.status(outcome.__error.status).json({
      success: false,
      result: null,
      message: outcome.__error.message,
    });
  }

  const result = await models.Payment.findOne({
    where: { id: outcome.paymentId },
    include: [
      { model: models.Invoice, as: 'invoice' },
      { model: models.Client, as: 'client' },
      { model: models.Admin, as: 'createdBy', attributes: ['id', 'name'] },
      { model: models.PaymentMode, as: 'paymentMode' },
    ],
  });

  return res.status(200).json({
    success: true,
    result,
    message: 'Successfully updated the Payment ',
  });
};

module.exports = update;
