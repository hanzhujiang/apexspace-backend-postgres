const { models } = require('@/db');
const createCRUDController = require('@/controllers/middlewaresControllers/createCRUDController');
const { toCalendarDate, dayBefore } = require('@/utils/dateTime');

function modelController() {
  const Model = models.ProductCosts;
  const methods = createCRUDController('ProductCosts');

  const genericCreate = methods.create;
  methods.create = async (req, res) => {
    const { sku, date_from } = req.body;

    if (sku && date_from) {
      const newDateFrom = toCalendarDate(date_from, req.userTz);

      // Close the current open-ended entry for this SKU with the calendar
      // day before the new entry starts (DATEONLY, no tz math).
      const openEntry = await Model.findOne({
        where: { sku, date_to: null, removed: false },
        order: [['date_from', 'DESC']],
      });
      if (openEntry && newDateFrom) {
        await Model.update(
          { date_to: dayBefore(newDateFrom), updated: new Date() },
          { where: { id: openEntry.id } }
        );
      }
    }

    return genericCreate(req, res);
  };

  return methods;
}

module.exports = modelController();
