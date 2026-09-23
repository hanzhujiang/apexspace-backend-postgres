const mongoose = require('mongoose');
const createCRUDController = require('@/controllers/middlewaresControllers/createCRUDController');

async function salesList(Model, req, res) {
  const page = req.query.page || 1;
  const limit = parseInt(req.query.items) || 10;
  const skip = page * limit - limit;

  const fieldsArray = req.query.fields ? req.query.fields.split(',') : [];
  let searchFilter = {};
  if (fieldsArray.length > 0) {
    searchFilter.$or = fieldsArray.map((field) => ({
      [field]: { $regex: new RegExp(req.query.q || '', 'i') },
    }));
  }

  // Use $ne: true so existing documents without a `removed` field are also included
  const baseQuery = { removed: { $ne: true }, ...searchFilter };

  const [result, count] = await Promise.all([
    Model.find(baseQuery).skip(skip).limit(limit).sort({ created: -1 }).exec(),
    Model.countDocuments(baseQuery),
  ]);

  const pages = Math.ceil(count / limit);
  const pagination = { page, pages, count };

  if (count > 0) {
    return res.status(200).json({
      success: true,
      result,
      pagination,
      message: 'Successfully found all documents',
    });
  } else {
    return res.status(203).json({
      success: true,
      result: [],
      pagination,
      message: 'Collection is Empty',
    });
  }
}

function modelController() {
  const Model = mongoose.model('Sales');
  const methods = createCRUDController('Sales');

  const genericCreate = methods.create;
  methods.create = (req, res) => {
    req.body.createdBy = req.admin._id;
    return genericCreate(req, res);
  };

  methods.list = (req, res) => salesList(Model, req, res);

  return methods;
}

module.exports = modelController();
