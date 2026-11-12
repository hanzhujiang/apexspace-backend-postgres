const express = require('express');
const { catchErrors } = require('@/handlers/errorHandlers');
const router = express.Router();

const appControllers = require('@/controllers/appControllers');
const { routesList } = require('@/models/utils');
const chatController = require('@/controllers/appControllers/chatController');

const routerApp = (entity, controller) => {
  router.route(`/${entity}/create`).post(catchErrors(controller['create']));
  router.route(`/${entity}/read/:id`).get(catchErrors(controller['read']));
  router.route(`/${entity}/update/:id`).patch(catchErrors(controller['update']));
  router.route(`/${entity}/delete/:id`).delete(catchErrors(controller['delete']));
  router.route(`/${entity}/search`).get(catchErrors(controller['search']));
  router.route(`/${entity}/list`).get(catchErrors(controller['list']));
  router.route(`/${entity}/listAll`).get(catchErrors(controller['listAll']));
  router.route(`/${entity}/filter`).get(catchErrors(controller['filter']));
  router.route(`/${entity}/summary`).get(catchErrors(controller['summary']));

  if (entity === 'invoice' || entity === 'quote' || entity === 'payment') {
    router.route(`/${entity}/mail`).post(catchErrors(controller['mail']));
  }

  if (entity === 'quote') {
    router.route(`/${entity}/convert/:id`).get(catchErrors(controller['convert']));
  }
};

routesList.forEach(({ entity, controllerName }) => {
  const controller = appControllers[controllerName];
  routerApp(entity, controller);
});

// Custom sales dashboard routes
const salesCtrl = appControllers['salesController'];
router.route('/sales/recent-chart').get(catchErrors(salesCtrl['recentChart']));
router.route('/sales/top-skus').get(catchErrors(salesCtrl['topSkus']));
router.route('/sales/stale-skus').get(catchErrors(salesCtrl['staleSkus']));
router.route('/sales/employee-performance').get(catchErrors(salesCtrl['employeePerformance']));

// Custom case resolution routes
const caseCtrl = appControllers['caseController'];
router.route('/case/resend/:id').post(catchErrors(caseCtrl['resend']));
router.route('/case/return/:id').post(catchErrors(caseCtrl['return']));
router.route('/case/refund/:id').post(catchErrors(caseCtrl['refund']));

// Custom inventory routes
const inventoryCtrl = appControllers['inventoryController'];
router.route('/inventory/arrived/:id').patch(catchErrors(inventoryCtrl['arrived']));
router.route('/inventory/update-ontheway/:id').patch(catchErrors(inventoryCtrl['updateOnTheWay']));

router.post('/chat', catchErrors(chatController.chat));

// Monthly P&L — custom aggregation endpoint + ads spend upsert.
const monthlyPnlCtrl = appControllers['monthlyPnlController'];
router.route('/monthly-pnl').get(catchErrors(monthlyPnlCtrl.getMonthly));
router.route('/monthly-pnl/ads').patch(catchErrors(monthlyPnlCtrl.upsertAds));

// Toolings routes
const multer = require('multer');
const koganUpload = require('@/controllers/appControllers/toolingsController/koganUpload');
const koganSeedWeights = require('@/controllers/appControllers/toolingsController/koganSeedWeights');
const upload = multer({ storage: multer.memoryStorage() });
router.post('/toolings/kogan-upload', upload.single('file'), catchErrors(koganUpload));
router.post('/toolings/kogan-weights-seed', catchErrors(koganSeedWeights));

// Product file upload (image + manual pdf) → stored in src/public/uploads/product/
const path = require('path');
const { slugify } = require('transliteration');
const { models: _models } = require('@/db');
const productDiskStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'src/public/uploads/product'),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const base = slugify(file.originalname.split('.')[0].toLowerCase()) || 'file';
    const uid = Math.random().toString(36).slice(2, 7);
    cb(null, `${base}-${uid}${ext}`);
  },
});
const productFileFilter = (req, file, cb) => {
  if (file.fieldname === 'image' && file.mimetype.startsWith('image/')) return cb(null, true);
  if (file.fieldname === 'manual_pdf' && file.mimetype === 'application/pdf') return cb(null, true);
  cb(new Error(`Invalid file type for field ${file.fieldname}: ${file.mimetype}`));
};
const productUpload = multer({ storage: productDiskStorage, fileFilter: productFileFilter }).fields([
  { name: 'image', maxCount: 1 },
  { name: 'manual_pdf', maxCount: 1 },
]);
router.patch('/product/upload/:id', productUpload, catchErrors(async (req, res) => {
  const product = await _models.Product.findOne({ where: { id: req.params.id, removed: false } });
  if (!product) return res.status(404).json({ success: false, result: null, message: 'Product not found' });
  const patch = {};
  if (req.files?.image?.[0]) patch.image_link = `public/uploads/product/${req.files.image[0].filename}`;
  if (req.files?.manual_pdf?.[0]) patch.manual_pdf_link = `public/uploads/product/${req.files.manual_pdf[0].filename}`;
  if (Object.keys(patch).length) await product.update(patch);
  return res.status(200).json({ success: true, result: product, message: 'Files uploaded' });
}));

module.exports = router;
