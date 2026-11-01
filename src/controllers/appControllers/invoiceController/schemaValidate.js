const Joi = require('joi');
const schema = Joi.object({
  client: Joi.alternatives().try(Joi.number(), Joi.string(), Joi.object()).required(),
  number: Joi.number().required(),
  year: Joi.number().required(),
  status: Joi.string().required(),
  notes: Joi.string().allow(''),
  expiredDate: Joi.date().required(),
  date: Joi.date().required(),
  // array cannot be empty
  items: Joi.array()
    .items(
      Joi.object({
        _id: Joi.alternatives().try(Joi.number(), Joi.string()).allow('').optional(),
        id: Joi.alternatives().try(Joi.number(), Joi.string()).allow('').optional(),
        invoice_id: Joi.alternatives().try(Joi.number(), Joi.string()).optional(),
        itemName: Joi.string().required(),
        description: Joi.string().allow(''),
        quantity: Joi.number().required(),
        price: Joi.number().required(),
        total: Joi.number().required(),
      }).required()
    )
    .required(),
  taxRate: Joi.alternatives().try(Joi.number(), Joi.string()).required(),
}).unknown(true); // backend recomputes totals/credit/paymentStatus from items + taxRate — tolerate client-sent extras.

module.exports = schema;
