const { models } = require('@/db');

exports.getData = ({ model }) => {
  const Model = models[model];
  return Model.findAll({ where: { removed: false, enabled: true } });
};

exports.getOne = ({ model, id }) => {
  const Model = models[model];
  return Model.findOne({ where: { id, removed: false } });
};
