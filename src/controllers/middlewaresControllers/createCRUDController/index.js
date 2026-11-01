const { models, Op } = require('@/db');

const createCRUDController = (modelName) => {
  const Model = models[modelName];
  if (!Model) throw new Error(`Sequelize model "${modelName}" does not exist`);

  const defaultInclude = Object.values(Model.associations || {}).map((assoc) => ({
    model: assoc.target,
    as: assoc.as,
    required: false,
  }));

  return {
    create: async (req, res) => {
      req.body.removed = false;
      const result = await Model.create(req.body);
      const full = await Model.findByPk(result.id, { include: defaultInclude });
      return res.status(200).json({ success: true, result: full, message: 'Successfully Created' });
    },

    read: async (req, res) => {
      const result = await Model.findOne({
        where: { id: req.params.id, removed: false },
        include: defaultInclude,
      });
      if (!result) return res.status(404).json({ success: false, result: null, message: 'No document found' });
      return res.status(200).json({ success: true, result, message: 'Found' });
    },

    update: async (req, res) => {
      req.body.removed = false;
      const [count] = await Model.update(req.body, { where: { id: req.params.id, removed: false } });
      if (!count) return res.status(404).json({ success: false, result: null, message: 'No document found' });
      const result = await Model.findByPk(req.params.id, { include: defaultInclude });
      return res.status(200).json({ success: true, result, message: 'Updated' });
    },

    delete: async (req, res) => {
      const [count] = await Model.update({ removed: true }, { where: { id: req.params.id } });
      if (!count) return res.status(404).json({ success: false, result: null, message: 'No document found' });
      const result = await Model.findByPk(req.params.id);
      return res.status(200).json({ success: true, result, message: 'Deleted' });
    },

    list: async (req, res) => {
      const page   = parseInt(req.query.page)  || 1;
      const limit  = parseInt(req.query.items) || 10;
      const offset = (page - 1) * limit;
      const { sortBy = 'id', sortValue = -1, filter, equal, q, fields } = req.query;

      const where = { removed: false };
      if (filter && equal) where[filter] = equal;
      if (q && fields) {
        where[Op.or] = fields.split(',').map((f) => ({ [f]: { [Op.like]: `%${q}%` } }));
      }

      const { rows: result, count } = await Model.findAndCountAll({
        where,
        include: defaultInclude,
        offset,
        limit,
        order: [[sortBy, sortValue == -1 || sortValue === 'desc' ? 'DESC' : 'ASC']],
      });

      const pages = Math.ceil(count / limit);
      const pagination = { page, pages, count };

      if (count > 0) {
        return res.status(200).json({ success: true, result, pagination, message: 'Found all documents' });
      }
      return res.status(203).json({ success: true, result: [], pagination, message: 'Collection is Empty' });
    },

    listAll: async (req, res) => {
      const { sort = 'desc', enabled } = req.query;
      const where = { removed: false };
      if (enabled !== undefined) where.enabled = enabled;
      const result = await Model.findAll({
        where,
        include: defaultInclude,
        order: [['created', sort.toUpperCase()]],
      });
      if (result.length > 0) {
        return res.status(200).json({ success: true, result, message: 'Found all documents' });
      }
      return res.status(203).json({ success: false, result: [], message: 'Collection is Empty' });
    },

    search: async (req, res) => {
      const { q = '', fields = 'name' } = req.query;
      const where = {
        removed: false,
        [Op.or]: fields.split(',').map((f) => ({ [f]: { [Op.like]: `%${q}%` } })),
      };
      const result = await Model.findAll({ where, include: defaultInclude, limit: 20 });
      if (result.length > 0) {
        return res.status(200).json({ success: true, result, message: 'Found' });
      }
      return res.status(202).json({ success: false, result: [], message: 'No document found' });
    },

    filter: async (req, res) => {
      const { filter, equal } = req.query;
      if (!filter || !equal) {
        return res.status(403).json({ success: false, result: null, message: 'filter not provided correctly' });
      }
      const result = await Model.findAll({
        where: { removed: false, [filter]: equal },
        include: defaultInclude,
      });
      return res.status(200).json({ success: true, result, message: 'Found' });
    },

    summary: async (req, res) => {
      const { filter, equal } = req.query;
      const countAllDocs = await Model.count({ where: { removed: false } });
      const countFilter  = filter && equal
        ? await Model.count({ where: { removed: false, [filter]: equal } })
        : countAllDocs;
      return res.status(200).json({ success: true, result: { countFilter, countAllDocs }, message: 'Count done' });
    },
  };
};

module.exports = createCRUDController;
