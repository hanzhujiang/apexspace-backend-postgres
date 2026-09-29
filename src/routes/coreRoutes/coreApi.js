const express = require('express');

const { catchErrors } = require('@/handlers/errorHandlers');

const router = express.Router();

const adminController = require('@/controllers/coreControllers/adminController');
const settingController = require('@/controllers/coreControllers/settingController');
const permissionController = require('@/controllers/coreControllers/permissionController');
const adminAuth = require('@/controllers/coreControllers/adminAuth');

const { singleStorageUpload } = require('@/middlewares/uploadMiddleware');

// //_______________________________ Admin management_______________________________

router.route('/admin/read/:id').get(catchErrors(adminController.read));

router.route('/admin/password-update/:id').patch(catchErrors(adminController.updatePassword));

//_______________________________ Admin Profile _______________________________

router.route('/admin/profile/password').patch(catchErrors(adminController.updateProfilePassword));
router.route('/admin/create').post(adminAuth.requireOwner, catchErrors(adminController.createAdmin));
router.route('/admin/list').get(adminAuth.requireOwner, catchErrors(adminController.listAdmins));
router.route('/admin/update/:id').patch(adminAuth.requireOwner, catchErrors(adminController.updateAdmin));
router
  .route('/admin/profile/update')
  .patch(
    singleStorageUpload({ entity: 'admin', fieldName: 'photo', fileType: 'image' }),
    catchErrors(adminController.updateProfile)
  );

// //____________________________________________ API for Global Setting _________________

router.route('/setting/create').post(catchErrors(settingController.create));
router.route('/setting/read/:id').get(catchErrors(settingController.read));
router.route('/setting/update/:id').patch(catchErrors(settingController.update));
//router.route('/setting/delete/:id).delete(catchErrors(settingController.delete));
router.route('/setting/search').get(catchErrors(settingController.search));
router.route('/setting/list').get(catchErrors(settingController.list));
router.route('/setting/listAll').get(catchErrors(settingController.listAll));
router.route('/setting/filter').get(catchErrors(settingController.filter));
router
  .route('/setting/readBySettingKey/:settingKey')
  .get(catchErrors(settingController.readBySettingKey));
router.route('/setting/listBySettingKey').get(catchErrors(settingController.listBySettingKey));
router
  .route('/setting/updateBySettingKey/:settingKey?')
  .patch(catchErrors(settingController.updateBySettingKey));
router
  .route('/setting/upload/:settingKey?')
  .patch(
    catchErrors(
      singleStorageUpload({ entity: 'setting', fieldName: 'settingValue', fileType: 'image' })
    ),
    catchErrors(settingController.updateBySettingKey)
  );
router.route('/setting/updateManySetting').patch(catchErrors(settingController.updateManySetting));

// _______________________________ Permission Management (owner only) _______________________________
router.route('/permission/list').get(adminAuth.requireOwner, catchErrors(permissionController.list));
router.route('/permission/update').patch(adminAuth.requireOwner, catchErrors(permissionController.update));

// Public permission list for non-owner users to load their own role's permissions
router.route('/permission/my').get(catchErrors(permissionController.listMy));

module.exports = router;
