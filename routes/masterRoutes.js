const express = require('express');
const router = express.Router();
const BrandController = require('../controllers/masterControllers/BrandControllers');
const ProductTypeController = require('../controllers/masterControllers/ProductTypeControllers');
const UnitController = require('../controllers/masterControllers/UnitControllers')
const DepartmentController = require('../controllers/masterControllers/DepartmentControllers')
const EmployeeController = require('../controllers/masterControllers/EmployeeControllers')
const LoginController = require('../controllers/masterControllers/LoginControllers')
const CategoryController = require('../controllers/masterControllers/CategoryControllers')
const ChildProductController = require('../controllers/masterControllers/ChildProductControllers')
const ParentProductController = require('../controllers/masterControllers/ParentProductControllers')
const MainParentProductController = require('../controllers/masterControllers/MainParentControllers')
const CustomerController = require('../controllers/masterControllers/CustomerControllers');
const NotificationController = require('../controllers/masterControllers/NotificationControllers')


//Notification 

router.post("/notifications", NotificationController.createNotification);
router.post("/Notifications/getNotifications", NotificationController.getNotificationsByUnit);


//********* Login ***************************** */
router.post('/Auth/login', LoginController.verifyLogin);

//********************Brand routers ********************** */
// Create Brand
router.post('/Brand/createBrand', BrandController.createBrand); 

// Get all Brands
router.post('/Brand/getAllBrands', BrandController.getAllBrands); 

// Get Brand by ID
// router.post('/Brand/getBrandByName', BrandController.getBrandByName); 

// Update Brand
router.post('/Brand/updateBrand', BrandController.updateBrand); 

// Delete Brand
router.post('/Brand/deleteBrand', BrandController.deleteBrand); 


//********************ProductType routers ********************** */
// Create ProductType
router.post('/ProductType/createProductType', ProductTypeController.createProductType); 

// Get all ProductTypes
router.post('/ProductType/getAllProductTypes', ProductTypeController.getAllProductTypes); 

// Get ProductType by ID
// router.post('/ProductType/getProductTypeByName', ProductTypeController.getProductTypeByName); 

// Update ProductType
router.post('/ProductType/updateProductType', ProductTypeController.updateProductType); 

// Delete ProductType
router.post('/ProductType/deleteProductType', ProductTypeController.deleteProductType); 

//********************Unit routers ********************** */
// Create Unit
router.post('/Unit/createUnit', UnitController.createUnit); 

// Get all Units
router.post('/Unit/getAllUnits', UnitController.getAllUnits); 

// Get Unit by ID
router.post('/Unit/getUnitByName', UnitController.getUnitByName); 

// Update Unit
router.post('/Unit/updateUnit', UnitController.updateUnit); 

// Delete Unit
router.post('/Unit/deleteUnit', UnitController.deleteUnit); 

//********************Department routers ********************** */
// Create Department
router.post('/Department/createDepartment', DepartmentController.createDepartment); 

// Get all Departments
router.post('/Department/getAllDepartments', DepartmentController.getAllDepartments); 

// Get Department by ID
router.post('/Department/getDepartmentByName', DepartmentController.getDepartmentByName); 

// Update Department
router.post('/Department/updateDepartment', DepartmentController.updateDepartment); 

// Delete Department
router.post('/Department/deleteDepartment', DepartmentController.deleteDepartment); 

//********************Employee routers ********************** */
// Create Employee
router.post('/Employee/createEmployee', EmployeeController.createEmployee); 

// Get all Employees
router.post('/Employee/getAllEmployees', EmployeeController.getAllEmployees); 

// Get Employee by ID
router.post('/Employee/getEmployeeByCode', EmployeeController.getEmployeeByCode); 

// Update Employee
router.post('/Employee/updateEmployee', EmployeeController.updateEmployee); 

// Delete Employee
router.post('/Employee/deleteEmployee', EmployeeController.deleteEmployee); 

// Get Department by unit id
router.post('/Employee/getAllDepartmentsByUnitId', EmployeeController.getAllDepartmentsByUnitId); 

//********************Category routers ********************** */
// Create Category
router.post('/Category/createCategory', CategoryController.createCategory); 

// Get all Categorys
router.post('/Category/getAllCategorys', CategoryController.getAllCategories); 

// Get Category by ID
// router.post('/Category/getCategoryByName', CategoryController.getCategoryByName); 

// Update Category
router.post('/Category/updateCategory', CategoryController.updateCategory); 

// Delete Category
router.post('/Category/deleteCategory', CategoryController.deleteCategory); 

//********************ChildProduct routers ********************** */
// Create ChildProduct
router.post('/ChildProduct/createChildProduct', ChildProductController.createChildProduct); 

// Get all ChildProducts
router.post('/ChildProduct/getAllChildProducts', ChildProductController.getAllChildProducts); 

// Get ChildProduct by ID
// router.post('/ChildProduct/getChildProductByName', ChildProductController.getChildProductByName); 

// Update ChildProduct
router.post('/ChildProduct/updateChildProduct', ChildProductController.updateChildProduct); 

// Delete ChildProduct
router.post('/ChildProduct/deleteChildProduct', ChildProductController.deleteChildProduct); 

// Get Category by unit id
router.post('/ChildProduct/getAllCategorysByUnitId', ChildProductController.getAllCategorysByUnitId); 

//********************ParentProduct routers ********************** */
// Create ParentProduct
router.post('/ParentProduct/createParentProduct', ParentProductController.createParentProduct); 

// insert many ParentProduct
router.post('/ParentProduct/insertManyParentProduct', ParentProductController.insertManyParentProducts); 

// Get all ParentProducts
router.post('/ParentProduct/getAllParentProducts', ParentProductController.getAllParentProducts); 

// Get ParentProduct by ID
// router.post('/ParentProduct/getParentProductByName', ParentProductController.getParentProductByName); 

// Update ParentProduct
router.post('/ParentProduct/updateParentProduct', ParentProductController.updateParentProduct); 

// Delete ParentProduct
router.post('/ParentProduct/deleteParentProduct', ParentProductController.deleteParentProduct); 

// Get Category by unit id
router.post('/ParentProduct/getAllChildProducts', ParentProductController.getAllChildProducts); 

//********************MainParentProduct routers ********************** */
// Create MainParentProduct
router.post('/MainParentProduct/createMainParentProduct', MainParentProductController.createMainParentProduct); 

// Get all MainParentProducts
router.post('/MainParentProduct/getAllMainParentProducts', MainParentProductController.getAllMainParentProducts); 

// Get MainParentProducts
router.post('/MainParentProduct/getMainParentProducts', MainParentProductController.getMainParentProducts);

// Get MainParentProduct by ID
router.post('/MainParentProduct/getMainParentsByName', MainParentProductController.getMainParentsByName); 

// Update MainParentProduct
router.post('/MainParentProduct/updateMainParentProduct', MainParentProductController.updateMainParentProduct); 

// Delete MainParentProduct
router.post('/MainParentProduct/deleteMainParentProduct', MainParentProductController.deleteMainParentProduct); 

// Get Category by unit id
router.post('/MainParentProduct/getAllParentProducts', MainParentProductController.getAllParentProducts); 


//******************** Customer Routes ***********************/

// Create Customer
router.post('/Customer/createCustomer', CustomerController.createCustomer);

// Get all Customers
router.post('/Customer/getAllCustomers', CustomerController.getAllCustomers);

// Update Customer
router.post('/Customer/updateCustomer', CustomerController.updateCustomer);

// Delete Customer
router.post('/Customer/deleteCustomer', CustomerController.deleteCustomer);

module.exports = router;