const { models, Op } = require('@/db');
const createCRUDController = require('@/controllers/middlewaresControllers/createCRUDController');

const methods = createCRUDController('Product');

// Attach `stock_all` from the Inventory table (joined on SKU). Not stored on
// the Product row — computed on read so inventory changes show through.
async function attachStock(products) {
  if (!products.length) return products;
  const toPlain = (p) => (typeof p.toJSON === 'function' ? p.toJSON() : { ...p });
  const skus = [...new Set(products.map((p) => p.sku).filter(Boolean))];
  if (!skus.length) return products.map(toPlain);

  const invRows = await models.Inventory.findAll({
    where: { sku: { [Op.in]: skus }, removed: false },
    attributes: ['sku', 'stock_all'],
    raw: true,
  });
  const stockMap = new Map(invRows.map((r) => [r.sku, r.stock_all]));
  return products.map((p) => {
    const plain = toPlain(p);
    plain.stock_all = plain.sku && stockMap.has(plain.sku) ? stockMap.get(plain.sku) : null;
    return plain;
  });
}

const Model = models.Product;

methods.list = async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.items) || 10;
  const offset = (page - 1) * limit;
  const { sortBy = 'id', sortValue = -1, filter, equal, q, fields } = req.query;

  const where = { removed: false };
  if (filter && equal) where[filter] = equal;
  if (q && fields) {
    where[Op.or] = fields.split(',').map((f) => ({ [f]: { [Op.iLike]: `%${q}%` } }));
  }

  const { rows, count } = await Model.findAndCountAll({
    where,
    offset,
    limit,
    order: [[sortBy, sortValue == -1 || sortValue === 'desc' ? 'DESC' : 'ASC']],
  });

  const result = await attachStock(rows);
  const pages = Math.ceil(count / limit);
  const pagination = { page, pages, count };

  if (count > 0) {
    return res.status(200).json({ success: true, result, pagination, message: 'Found all documents' });
  }
  return res.status(203).json({ success: true, result: [], pagination, message: 'Collection is Empty' });
};

methods.read = async (req, res) => {
  const row = await Model.findOne({ where: { id: req.params.id, removed: false } });
  if (!row) return res.status(404).json({ success: false, result: null, message: 'No document found' });
  const [enriched] = await attachStock([row]);
  return res.status(200).json({ success: true, result: enriched, message: 'Found' });
};

module.exports = methods;
