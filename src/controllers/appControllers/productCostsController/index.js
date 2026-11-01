const { models } = require('@/db');
const createCRUDController = require('@/controllers/middlewaresControllers/createCRUDController');

function modelController() {
  const Model = models.ProductCosts;
  const methods = createCRUDController('ProductCosts');

  const genericCreate = methods.create;
  methods.create = async (req, res) => {
    const { sku, date_from } = req.body;

    if (sku && date_from) {
      const newDateFrom = new Date(date_from);

      // Close the current open-ended entry for this SKU
      const openEntry = await Model.findOne({
        where: { sku, date_to: null, removed: false },
        order: [['date_from', 'DESC']],
      });
      if (openEntry) {
        const closeDate = new Date(newDateFrom);
        closeDate.setDate(closeDate.getDate() - 1);
        closeDate.setHours(23, 59, 59, 999);
        await Model.update(
          { date_to: closeDate, updated: new Date() },
          { where: { id: openEntry.id } }
        );
      }
    }

    return genericCreate(req, res);
  };

  return methods;
}

module.exports = modelController();
