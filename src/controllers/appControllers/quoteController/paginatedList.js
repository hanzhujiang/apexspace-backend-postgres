const { models, Op } = require('@/db');

const paginatedList = async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.items) || 10;
  const offset = (page - 1) * limit;

  const { sortBy = 'id', sortValue = -1, filter, equal, q, fields } = req.query;

  const where = { removed: false };
  if (filter && equal !== undefined) where[filter] = equal;
  if (q && fields) {
    where[Op.or] = fields.split(',').map((f) => ({ [f]: { [Op.iLike]: `%${q}%` } }));
  }

  const order = [[sortBy, sortValue == -1 || sortValue === 'desc' ? 'DESC' : 'ASC']];

  const { rows: result, count } = await models.Quote.findAndCountAll({
    where,
    include: [
      { model: models.QuoteItem, as: 'items' },
      { model: models.Client, as: 'client' },
      { model: models.Admin, as: 'createdBy', attributes: ['id', 'name'] },
    ],
    offset,
    limit,
    order,
    distinct: true,
  });

  const pages = Math.ceil(count / limit);
  const pagination = { page, pages, count };

  if (count > 0) {
    return res.status(200).json({
      success: true,
      result,
      pagination,
      message: 'Successfully found all documents',
    });
  }
  return res.status(203).json({
    success: true,
    result: [],
    pagination,
    message: 'Collection is Empty',
  });
};

module.exports = paginatedList;
