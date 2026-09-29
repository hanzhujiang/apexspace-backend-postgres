const mongoose = require('mongoose');
const createCRUDController = require('@/controllers/middlewaresControllers/createCRUDController');

function modelController() {
  const Model = mongoose.model('ProductCosts');
  const methods = createCRUDController('ProductCosts');

  const genericCreate = methods.create;
  methods.create = async (req, res) => {
    const { sku, date_from } = req.body;

    if (sku && date_from) {
      const newDateFrom = new Date(date_from);

      // Close the current open-ended entry for this SKU
      const openEntry = await Model.findOne({ sku, date_to: null, removed: { $ne: true } }).sort({ date_from: -1 });
      if (openEntry) {
        const closeDate = new Date(newDateFrom);
        closeDate.setDate(closeDate.getDate() - 1);
        closeDate.setHours(23, 59, 59, 999);
        openEntry.date_to = closeDate;
        openEntry.updated = new Date();
        await openEntry.save();
      }
    }

    return genericCreate(req, res);
  };

  return methods;
}

module.exports = modelController();
