const express = require('express');
const router = express.Router();
const AddStockControllers = require('../controllers/mainControllers/AddStockControllers')
const ProductSharinControllers = require('../controllers/mainControllers/ProductSharingControllers')
const controller = require('../controllers/mainControllers/RevertCountsController')
const OrderController = require('../controllers/mainControllers/OrderCreationControllers')
const FilterOrder = require('../controllers/mainControllers/FilterOrder')
const ProductTransactionController = require('../controllers/mainControllers/ProductTransferControllers')
const LogControllers = require('../controllers/mainControllers/ActivityLogControllers')
const MenuControllers = require('../controllers/mainControllers/MenuControllers')
const UserRightsControllers = require('../controllers/mainControllers/UserRightsControllers')

router.post('/reset-child-products', controller.resetAllChildProducts);
router.post('/reset-parent-products', controller.resetAllParentProducts);
router.post('/reset-main-parent-products', controller.resetAllMainParentProducts);
router.post('/ProductShareTesting', controller.ProductSharetesting);

// ➡️ Create outward + inward
router.post("/outwards/create", ProductTransactionController.createProductOutward);
router.post("/DeleteDuplicateLogs", ProductTransactionController.deleteDuplicateLogs);

// ➡️ List outwards for a unit
router.post("/outwards/list", ProductTransactionController.getProductOutwards);
router.post("/outwards/FilterOutWards", ProductTransactionController.getOutwardsByDate);
router.post("/outwards/FilterInWards", ProductTransactionController.getInwardsByDate);

// ➡️ List units
router.post("/outwards/getAllUnits", ProductTransactionController.getAllUnits);

// ➡️ List inwards for a unit
router.post("/inwards/list", ProductTransactionController.getProductInwards);

// Add Child product Stock
router.post('/AddStock/AddChildStock', AddStockControllers.addStockToChildProduct); 

// Add Parent product Stock
router.post('/AddStock/AddParentStock', AddStockControllers.addStockToParentProduct); 

// Add Bulk Parent product Stock
router.post('/AddStock/AddBulkParentProducts', AddStockControllers.bulkAddStockToParentProducts); 

// Add Bulk Parent product Stock
router.post('/AddStock/recalculateMainParentStocks', AddStockControllers.recalculateMainParentStocks); 

// Add Main Parent product Stock
router.post('/AddStock/AddMainParentStock', AddStockControllers.addStockToMainParentProduct); 

router.post('/AdjustStock/AdjustStock', AddStockControllers.adjustStock); 

// Get Parent products based on avoiding already selected products
router.post('/ProductSharing/getAllMainParentProducts', ProductSharinControllers.getAllMainParentProducts)

// Share products
router.post('/ProductSharing/shareProductsBetweenParents', ProductSharinControllers.shareProductsBetweenParents)


//******************** Order Routes ***********************/
router.post('/Order/createOrder', OrderController.createOrder);
router.post('/Order/getAllOrders', OrderController.getAllOrders);
router.post('/Order/getAllMicroOrders', OrderController.getMicroAllOrders);
router.post('/Order/updateOrder', OrderController.updateOrder);
router.post('/Order/bulkExecuteOrders', OrderController.bulkExecuteOrders);
router.post('/Order/deleteOrder', OrderController.deleteOrder);
router.post('/Order/getAllCustomers', OrderController.getAllCustomers)
router.post('/Order/getAllProductTypes', OrderController.getAllProductTypes)
router.post('/Order/getAllChildProducts', OrderController.getAllChildProducts)
router.post('/Order/getAllParentProducts', OrderController.getAllParentProducts)
router.post('/Order/getAllMainParents', OrderController.getAllMainParentProducts)
router.post('/Order/updateAssignedQuantities', OrderController.updateAssignedQuantities)
router.post('/Order/confirmOrder', OrderController.confirmOrder)
router.post('/Order/ChangeStatus', OrderController.ChangeStatus)

router.post('/Order/FilterOrder', FilterOrder.filterOrders )
router.post('/Order/getItemWisePendingOrders', FilterOrder.filterPendingOrdersByProduct)
router.post('/Order/getAllItemwisePendingOrders', FilterOrder.getAllItemwisePendingOrders)
router.post('/Order/getAllOrderwisePendingOrders', FilterOrder.getAllOrderwisePendingOrders)
router.post('/Order/getPendingOrderCounts', FilterOrder.getPendingOrderCounts)
router.post('/Order/searchOrders', FilterOrder.searchOrders)

router.post('/Log/getAllLogs', LogControllers.getAllLogs )
router.post('/Log/getSearchLog', LogControllers.getSearchLog )
router.post('/Log/getFilteredLogs', LogControllers.getFilteredLogs )
router.post('/Log/createLog', LogControllers.logCreate )
router.post('/Log/logCountChange', LogControllers.logCountChange )

router.post('/Menu/createMenu', MenuControllers.createMenu)
router.post('/Menu/insertManyMenus', MenuControllers.InsertMany)
router.post('/Menu/updateMenu', MenuControllers.updateMenu)
router.post('/Menu/getAllMenus', MenuControllers.getAllMenus)
router.post('/Menu/getAllParentsByUnitId', MenuControllers.getAllParentsByUnitId)
router.post('/Menu/getAllUnits', MenuControllers.getAllUnits)


router.post('/UserRights/getUserRightsByEmployeeId', UserRightsControllers.getUserRightsByEmployee)
router.post('/UserRights/getAllUserRights', UserRightsControllers.getAllUserRights)
router.post('/UserRights/createUserRights', UserRightsControllers.createUserRights)
router.post('/UserRights/updateUserRights', UserRightsControllers.updateUserRights)
router.post('/UserRights/getAllMenus', UserRightsControllers.getAllMenus)
router.post('/UserRights/getAllEmployees', UserRightsControllers.getAllEmployees)
router.post('/UserRights/getAllUnits', UserRightsControllers.getAllUnits)

module.exports = router;