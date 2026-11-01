const { models, Op } = require('@/db');

const paginatedList = async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.items) || 10;
  const offset = page * limit - limit;

  const { sortBy = 'created', sortValue = -1, filter, equal } = req.query;

  const fieldsArray = req.query.fields ? req.query.fields.split(',') : [];

  const where = { removed: false };

  if (filter && equal !== undefined) {
    where[filter] = equal;
  }

  if (fieldsArray.length > 0) {
    const q = req.query.q || '';
    where[Op.or] = fieldsArray.map((field) => ({
      [field]: { [Op.iLike]: `%${q}%` },
    }));
  }

  const direction =
    String(sortValue) === '-1' || String(sortValue).toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

  //  Query the database for a list of all results
  const { rows: result, count } = await models.Invoice.findAndCountAll({
    where,
    include: [{ model: models.Admin, as: 'createdBy', attributes: ['id', 'name'] }],
    offset,
    limit,
    order: [[sortBy, direction]],
    distinct: true,
  });

  // Calculating total pages
  const pages = Math.ceil(count / limit);

  // Getting Pagination Object
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
};

module.exports = paginatedList;
