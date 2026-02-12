// controllers/userRightsController.js
const mongoose = require('mongoose');
const MenuRegistry = require("../../models/masterModels/MenuRegistry");
const UserRights = require('../../models/masterModels/UserRights');
const Unit = require("../../models/masterModels/Unit");
const Employee = require("../../models/masterModels/Employee");

exports.createUserRights = async (req, res) => {
  try {
    const { employeeId, rights } = req.body;

    if (!employeeId || !rights || !Array.isArray(rights)) {
      return res.status(400).json({
        message: "employeeId and rights array are required."
      });
    }

    // Prepare documents
    const docs = rights.map(item => ({
      employeeId:new mongoose.Types.ObjectId(employeeId),
      menuId:new mongoose.Types.ObjectId(item.menuId),
      isEnable: item.isEnable ?? true,
      isView: item.isView ?? true,
      isEdit: item.isEdit ?? true,
      isAdd: item.isAdd ?? true,
      isDelete: item.isDelete ?? true,
      unitAccess: item.unitAccess?.map(id => new mongoose.Types.ObjectId(id)) ?? []
    }));

    await UserRights.insertMany(docs);

    res.status(200).json({
      message: "User rights created successfully."
    });
  } catch (error) {
    console.error("Create UserRights error:", error);
    res.status(500).json({ message: error.message });
  }
};
function buildMenuTree(flatList) {
  const map = new Map();
  const roots = [];

  flatList.forEach(item => {
    map.set(item.formId, { ...item, children: [] });
  });

  flatList.forEach(item => {
    if (item.parentFormId) {
      const parent = map.get(item.parentFormId);
      if (parent) {
        parent.children.push(map.get(item.formId));
      }
    } else {
      roots.push(map.get(item.formId));
    }
  });

  return roots;
}
exports.getUserRightsByEmployee = async (req, res) => {
  try {
    const { employeeId } = req.body;

    if (!employeeId) {
      return res.status(400).json({
        message: "employeeId is required"
      });
    }

    const employeeObjectId = new mongoose.Types.ObjectId(employeeId);

    // Fetch UserRights document
    const userRights = await UserRights.findOne({
      employeeId: employeeObjectId
    }).lean();

    if (!userRights || !userRights.menus || userRights.menus.length === 0) {
      return res.status(200).json({
        message: "No user rights found.",
        data: []
      });
    }

    // Step 1: Get all unique menuIds
    const allMenuIds = userRights.menus.map((m) =>
      new mongoose.Types.ObjectId(m.menuId)
    );

    // Step 2: Lookup sortOrder and other details from MenuRegistry
    const menuRegistryDocs = await MenuRegistry.find({
      _id: { $in: allMenuIds }
    })
      .select("_id formId title parentFormId sortOrder")
      .lean();

    const menuRegistryMap = new Map();
    menuRegistryDocs.forEach((menu) => {
      menuRegistryMap.set(menu._id.toString(), menu);
    });

    // Step 3: Lookup Unit names
    const allUnitIds = new Set();
    userRights.menus.forEach((menu) => {
      (menu.unitAccess || []).forEach((id) => {
        allUnitIds.add(id.toString());
      });
    });

    const unitDocs = await Unit.find({
      _id: { $in: Array.from(allUnitIds).map((id) => new mongoose.Types.ObjectId(id)) }
    }).select("_id UnitName").lean();

    const unitMap = new Map();
    unitDocs.forEach((unit) => {
      unitMap.set(unit._id.toString(), unit.UnitName);
    });

    // Step 4: Assemble the menus with sortOrder etc.
    const enabledMenus = userRights.menus.filter(m => m.isEnable === true);

    const result = enabledMenus.map((menu) => {
      const registry = menuRegistryMap.get(menu.menuId?.toString()) || {};

      return {
        menuId: menu.menuId,
        formId: registry.formId || null,
        title: registry.title || "",
        parentFormId: registry.parentFormId || null,
        isView: menu.isView,
        isAdd: menu.isAdd,
        isEdit: menu.isEdit,
        isDelete: menu.isDelete,
        isNotification: menu.isNotification,
        sortOrder: registry.sortOrder || 0,
        unitAccess: (menu.unitAccess || []).map(
          (id) => unitMap.get(id.toString()) || ""
        )
      };
    });

    // Step 5: Sort by sortOrder
    result.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));

    // Step 6: Convert flat list to tree
    const menuTree = buildMenuTree(result);

    return res.status(200).json({
      message: "User rights fetched successfully.",
      data: menuTree
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      message: error.message
    });
  }
};

exports.getAllUserRights = async (req, res) => {
  try {
    const allUserRights = await UserRights.find({})
      .populate("employeeId", "_id EmployeeName unitId")
      .lean();

    const results = [];

    for (const userRight of allUserRights) {
      const employee = userRight.employeeId;

      // fetch unit details
      const employeeDoc = await Employee.findById(employee._id)
        .populate("unitId", "_id UnitName")
        .lean();

      const unitId = employeeDoc.unitId?._id || null;
      const UnitName = employeeDoc.unitId?.UnitName || null;

      // Merge menus into tree format
      const mergedMenus = userRight.menus;
      // Remove disabled menus without children
      const filteredMenus = mergedMenus.filter((menu) => {
        if (menu.parentFormId) return true;

        const hasChildren = mergedMenus.some(
          (m) => m.parentFormId === menu.formId
        );
        return menu.isEnable || hasChildren;
      });

      results.push({
        _id:userRight._id,
        employeeId: employee._id,
        employeeName: employee.EmployeeName,
        unitId,
        UnitName,
        menus: buildMenuResponseTree(filteredMenus)
      });
    }

    return res.status(200).json(results);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: error.message });
  }
};

exports.updateUserRights = async (req, res) => {
  try {
    const { _id, employeeId, menus } = req.body;

    if (!employeeId || !menus || !Array.isArray(menus)) {
      return res.status(400).json({
        message: "employeeId and menus array are required."
      });
    }

    const employeeObjectId = new mongoose.Types.ObjectId(employeeId);

    // Build the updated data object
    const updatedData = {
      employeeId: employeeObjectId,
      menus: menus.map((menu) => ({
        menuId: menu.menuId
          ? new mongoose.Types.ObjectId(menu.menuId)
          : null,
        formId: menu.formId,
        parentFormId: menu.parentFormId || null,
        title: menu.title,
        isEnable: menu.isEnable ?? false,
        isView: menu.isView ?? false,
        isAdd: menu.isAdd ?? false,
        isEdit: menu.isEdit ?? false,
        isDelete: menu.isDelete ?? false,
        isNotification: menu.isNotification ?? false,
        unitAccess:
          menu.unitAccess?.map(
            (id) => new mongoose.Types.ObjectId(id)
          ) ?? [],
      })),
    };

    let result;

    if (_id) {
      // Update by document _id
      result = await UserRights.findByIdAndUpdate(
        _id,
        updatedData,
        { new: true }
      );

      if (!result) {
        return res.status(404).json({
          message: "UserRights document not found.",
        });
      }
    } else {
      // Upsert by employeeId if _id is not provided
      result = await UserRights.findOneAndUpdate(
        { employeeId: employeeObjectId },
        updatedData,
        { upsert: true, new: true }
      );
    }

    res.status(200).json({
      message: "User rights updated successfully.",
      data: result,
    });
  } catch (error) {
    console.error("Update UserRights error:", error);
    res.status(500).json({ message: error.message });
  }
};

exports.deleteUserRight = async (req, res) => {
  try {
    const { id } = req.body;

    const deleted = await UserRights.findByIdAndDelete(id);

    if (!deleted) {
      return res.status(404).json({ message: "User right not found." });
    }

    res.status(200).json({
      message: "User right deleted successfully."
    });
  } catch (error) {
    console.error("Delete UserRights error:", error);
    res.status(500).json({ message: error.message });
  }
};

exports.getAllMenus = async (req, res) => {
  try {
    const { unitId } = req.body;

    if (!unitId) {
      return res.status(400).json({
        message: "unitId is required in the request body."
      });
    }

    // Step 1 → Fetch menus accessible to the unitId
    const menus = await MenuRegistry.find({
      $or: [
        // { unitAccess: { $exists: false } },
        // { unitAccess: { $size: 0 } },
        { unitAccess: new mongoose.Types.ObjectId(unitId) }
      ],
      isActive: true
    })
      .populate("unitAccess", "_id UnitName")
      .sort({ sortOrder: 1 })
      .lean();
    // Step 2 → Build a lookup map { formId → menu }
    const menuMap = {};
    for (const menu of menus) {
      menuMap[menu.formId] = menu;
    }

    // Step 3 → Add parentTitle to each menu
    menus.forEach(menu => {
      menu.parentTitle = menu.parentFormId
        ? menuMap[menu.parentFormId]?.title || null
        : null;
    });

    // Step 4 → Build tree hierarchy
    const tree = buildMenuResponseTree(menus);

    return res.status(200).json(tree);

  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: "Error fetching menus",
      error: error.message
    });
  }
};

exports.getAllEmployees = async (req, res) => {
  try {
    const { unitId } = req.body;
    const employees = await Employee.find({unitId:unitId})

    res.status(200).json(employees);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error fetching employees" });
  }
};

exports.getAllUnits = async (req, res) => {
  try {
    const units = await Unit.find({ isActive: true });

    res.status(200).json(units);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error fetching units" });
  }
};

function buildMenuResponseTree(items, parentFormId = null) {
  return items
    .filter(item => item.parentFormId === parentFormId)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map(item => ({
      menuId: item.menuId,
      title: item.title,
      formId: item.formId,
      parentFormId: item.parentFormId,
      isEnable: item.isEnable,
      isAdd: item.isAdd,
      isEdit: item.isEdit,
      isView: item.isView,
      isDelete: item.isDelete,
      isNotification: item.isNotification,
      children: buildMenuResponseTree(items, item.formId)
    }));
}

