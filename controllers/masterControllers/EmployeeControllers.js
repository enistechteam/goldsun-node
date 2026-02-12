const Employee = require('../../models/masterModels/Employee');
const Department = require('../../models/masterModels/Department');
const mongoose = require('mongoose');
const defaultMenus = require('./defaultMenu.json')
const UserRights = require('../../models/masterModels/UserRights')
const MenuRegistry = require('../../models/masterModels/MenuRegistry')

// Create a new employee
exports.createEmployee = async (req, res) => {
  try {
    const {
      unitId,
      departmentId,
      EmployeeName,
      EmployeeCode,
      password,
      role,
      canViewAllUnits,
      isActive
    } = req.body;

    // 1. Validate role
    if (!role || !defaultMenus[role]) {
      return res.status(400).json({ message: "Invalid or missing role" });
    }

    const defaultMenuIds = defaultMenus[role].map((id) => id.toString());

    // 2. Check for duplicate employee code
    const existing = await Employee.findOne({isActive:true, EmployeeCode });
    if (existing) {
      return res.status(400).json({ message: "Employee code already exists" });
    }

    // 3. Create employee
    const employee = new Employee({
      unitId,
      departmentId,
      EmployeeName,
      EmployeeCode,
      password,
      role,
      canViewAllUnits,
      isActive
    });

    await employee.save();

    // 4. Fetch all menu registry items
    const allMenus = await MenuRegistry.find({}).lean();

    // 5. Build userRights.menus array
    const menuPermissions = allMenus.map((menu) => {
      const isDefault = defaultMenuIds.includes(menu._id.toString());

      return {
        menuId: menu._id,
        formId: menu.formId,
        parentFormId: menu.parentFormId || null,
        title: menu.title,
        isEnable: isDefault,
        isView: isDefault,
        isAdd: isDefault,
        isEdit: isDefault,
        isDelete: isDefault,
        isNotification: isDefault && role === "admin",
        unitAccess: isDefault ? [employee.unitId] : []
      };
    });

    // 6. Create user rights doc (one per employee)
    const userRights = new UserRights({
      employeeId: employee._id,
      unitId: employee.unitId,
      menus: menuPermissions
    });

    await userRights.save();

    // 7. Response
    res.status(200).json({
      message: "Employee created successfully",
      data: employee._id
    });
  } catch (error) {
    console.error("Create Employee Error:", error);
    res.status(500).json({ message: error.message });
  }
};

// Get all employees
exports.getAllEmployees = async (req, res) => {
  try {
    const { unitId } = req.body;
    const matchstage={isActive:true,unitId:new mongoose.Types.ObjectId(unitId)}
const employees = await Employee.aggregate([
   {$match:matchstage},
  {
    $lookup: {
      from: 'units',
      localField: 'unitId',
      foreignField: '_id',
      as: 'unit'
    }
  },
  { $unwind: { path: '$unit', preserveNullAndEmptyArrays: true } },

  // Lookup department details
  {
    $lookup: {
      from: 'departments',
      localField: 'departmentId',
      foreignField: '_id',
      as: 'department'
    }
  },
  { $unwind: { path: '$department', preserveNullAndEmptyArrays: true } },

  // Project flattened result
  {
    $project: {
      _id: 1,
      EmployeeName: 1,
      EmployeeCode: 1,
      role: 1,
      password: 1,
      canViewAllUnits: 1,
      isActive: 1,
      unitId: '$unit._id',
      unitName: '$unit.name',
      departmentId: '$department._id',
      DepartmentName: '$department.DepartmentName',
      createdAt: 1,
      updatedAt: 1
    }
  },
  { $sort: { createdAt: -1 } }
]);

    res.status(200).json(employees);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get single employee by EmployeeCode
exports.getEmployeeByCode = async (req, res) => {
  try {
    const { EmployeeCode } = req.body;

    const employee = await Employee.findOne({ EmployeeCode })
      .populate({ path: 'unitId', select: '_id name' })
      .populate({ path: 'departmentId', select: '_id name' });

    if (!employee) {
      return res.status(400).json({ message: 'Employee not found' });
    }

    res.status(200).json(employee);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Update employee
exports.updateEmployee = async (req, res) => {
  try {
    const {
      _id,
      unitId,
      departmentId,
      EmployeeName,
      EmployeeCode,
      password,
      role,
      canViewAllUnits,
      isActive
    } = req.body;

    const updated = await Employee.findByIdAndUpdate(
      _id,
      {
        unitId,
        departmentId,
        EmployeeName,
        EmployeeCode,
        password,
        role,
        canViewAllUnits,
        isActive
      },
      { new: true, runValidators: true }
    )
      .populate({ path: 'unitId', select: '_id name' })
      .populate({ path: 'departmentId', select: '_id name' });

    if (!updated) {
      return res.status(400).json({ message: 'Employee not found' });
    }

    res.status(200).json({ message: 'Employee updated successfully', data: updated });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Soft delete employee
exports.deleteEmployee = async (req, res) => {
  try {
    const { _id } = req.body;

    // const deleted = await Employee.findByIdAndUpdate(_id, { isActive: false }, { new: true });
    const deleted = await Employee.findByIdAndDelete(_id);

    if (!deleted) {
      return res.status(400).json({ message: 'Employee not found' });
    }

    res.status(200).json({ message: 'Employee deactivated successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get all departments for a given unitId
exports.getAllDepartmentsByUnitId = async (req, res) => {
  try {
    const { unitId } = req.body;
const matchstage={isActive:true,unitId: new mongoose.Types.ObjectId(unitId)}
            const departments = await Department.aggregate([
                {$match:matchstage},
                {
                $project:{
                    _id:0,
                    DepartmentIDPK:'$_id',
                    DepartmentCode:'$DepartmentCode',
                    DepartmentName:'$DepartmentName',
                }
            },
            { $sort: { createdAt: -1 } }
          ])

    res.status(200).json(
      {
            message: 'Departments fetched successfully',
            data: departments
        }
      );
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
