/**
 * Replicates the shape of the old Mongoose-based `src/models/utils` for the
 * Sequelize backend. Previously this file globbed `src/models/appModels/*.js`
 * to derive route/controller/model name triples; since Sequelize models live
 * in `src/db/index.js`, we enumerate the app models here explicitly.
 *
 * Entity names (lowercase, URL path segments) match the original Mongoose
 * filename-based derivation so route paths stay byte-identical with crm-backend.
 */

const appModelsList = [
  'Client',
  'Inventory',
  'Invoice',
  'KoganSkuWeight',
  'Payment',
  'PaymentMode',
  'ProductCosts',
  'Quote',
  'Sales',
  'Taxes',
  'Warehouse',
];

const routesList = appModelsList.map((modelName) => {
  const first = modelName.charAt(0);
  const camel = modelName.replace(first, first.toLowerCase());
  return {
    entity: modelName.toLowerCase(),
    modelName,
    controllerName: camel + 'Controller',
  };
});

const controllersList = routesList.map((r) => r.controllerName);
const entityList = routesList.map((r) => r.entity);
const modelsFiles = appModelsList; // kept for backward compatibility; not used.

module.exports = {
  appModelsList,
  controllersList,
  constrollersList: controllersList, // mirror original (misspelled) export name
  entityList,
  modelsFiles,
  routesList,
};
