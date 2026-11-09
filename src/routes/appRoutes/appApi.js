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

// Toolings routes
const multer = require('multer');
const koganUpload = require('@/controllers/appControllers/toolingsController/koganUpload');
const koganSeedWeights = require('@/controllers/appControllers/toolingsController/koganSeedWeights');
const upload = multer({ storage: multer.memoryStorage() });
router.post('/toolings/kogan-upload', upload.single('file'), catchErrors(koganUpload));
router.post('/toolings/kogan-weights-seed', catchErrors(koganSeedWeights));

module.exports = router;
