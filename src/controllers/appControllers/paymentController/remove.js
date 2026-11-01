const { models, sequelize } = require('@/db');

const { calculate } = require('@/helpers');

const remove = async (req, res) => {
  const outcome = await sequelize.transaction(async (t) => {
    const previousPayment = await models.Payment.findOne({
      where: { id: req.params.id, removed: false },
      transaction: t,
    });

    if (!previousPayment) {
      return { __error: { status: 404, message: 'No document found ' } };
    }

    const invoice = await models.Invoice.findOne({
      where: { id: previousPayment.invoice_id },
      transaction: t,
    });

    const previousAmount = Number(previousPayment.amount);

    await previousPayment.update({ removed: true }, { transaction: t });

    if (invoice) {
      const total = Number(invoice.total);
      const discount = Number(invoice.discount);
      const previousCredit = Number(invoice.credit);
      const newCredit = calculate.sub(previousCredit, previousAmount);

      const paymentStatus =
        calculate.sub(total, discount) === newCredit
          ? 'paid'
          : newCredit > 0
          ? 'partially'
          : 'unpaid';

      await invoice.decrement('credit', { by: previousAmount, transaction: t });
      await invoice.update({ paymentStatus }, { transaction: t });
    }

    return { paymentId: previousPayment.id };
  });

  if (outcome && outcome.__error) {
    return res.status(outcome.__error.status).json({
      success: false,
      result: null,
      message: outcome.__error.message,
    });
  }

  const result = await models.Payment.findOne({ where: { id: outcome.paymentId } });

  return res.status(200).json({
    success: true,
    result,
    message: 'Successfully Deleted the document ',
  });
};

module.exports = remove;
