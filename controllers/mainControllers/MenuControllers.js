// controllers/menuRegistryController.js
const MenuRegistry = require("../../models/masterModels/MenuRegistry");
const Employee = require("../../models/masterModels/Employee");
const UserRights = require("../../models/masterModels/UserRights")
const Unit = require("../../models/masterModels/Unit");
const mongoose = require("mongoose");

exports.createMenu = async (req, res) => {
  try {
    const {
      formId,
      title,
      parentFormId,
      actions,
      unitAccess,
      sortOrder,
      isActive
    } = req.body;

    const menu = new MenuRegistry({
      formId,
      title,
      parentFormId,
      actions,
      unitAccess,
      sortOrder,
      isActive
    });

    await menu.save();
const newMenuEntry = {
      menuId: menu._id,
      formId: menu.formId,
      parentFormId: menu.parentFormId || null,
      title: menu.title,
      isEnable: false,
      isView: false,
      isAdd: false,
      isEdit: false,
      isDelete: false,
      isNotification: false,
      unitAccess: []
    };

    // Step 3: Update all UserRights documents
    await UserRights.updateMany(
      {},
      { $push: { menus: newMenuEntry } }
    );
    res.status(201).json({
      message: "Menu created successfully",
      data: menu
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error creating menu" });
  }
};

exports.InsertMany = async (req,res)=>{
    try{

        const menus=req.body
MenuRegistry.insertMany(menus)
  .then(() => {
    res.status(201).json({
      message: "Menu created successfully",
    });
  })
  .catch(err => {
     console.error(err);
    res.status(500).json({ message: "Error creating menu" });
  });
}catch(error){
 console.error(error);
    res.status(500).json({ message: "Error creating menu" });
}
}

exports.getAllMenus = async (req, res) => {
  try {
    // Step 1 → Fetch all menus and populate unitAccess with _id + name
    const menus = await MenuRegistry.find()
      .populate("unitAccess", "_id UnitName")
      .sort({ sortOrder: 1 })
      .lean(); // lean = plain JS objects

    // Step 2 → Create a lookup map of { formId → title }
    const menuMap = {};
    for (const menu of menus) {
      menuMap[menu.formId] = menu.title;
    }

    // Step 3 → Enrich each menu with parentTitle
    const enrichedMenus = menus.map(menu => ({
      ...menu,
      parentTitle: menu.parentFormId ? menuMap[menu.parentFormId] || null : null
    }));

    // Step 4 → Send enriched menus
    res.status(200).json(enrichedMenus
    );

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error fetching menus" });
  }
};

exports.updateMenu = async (req, res) => {
  try {
    const {_id,parentFormId,formId,title,sortOrder,unitAccess} = req.body
    const updateData ={parentFormId,formId,title,sortOrder,unitAccess}
    const updatedMenu = await MenuRegistry.findByIdAndUpdate(
      _id,
      updateData,
      { new: true }
    );

    if (!updatedMenu) {
      return res.status(404).json({ message: "Menu not found" });
    }

    res.status(200).json({
      message: "Menu updated successfully",
      data: updatedMenu
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error updating menu" });
  }
};

exports.deleteMenu = async (req, res) => {
  try {
    const deleted = await MenuRegistry.findByIdAndDelete(req.body._id);

    if (!deleted) {
      return res.status(404).json({ message: "Menu not found" });
    }

    res.status(200).json({ message: "Menu deleted successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error deleting menu" });
  }
};

exports.getAllEmployees = async (req, res) => {
  try {
    const employees = await Employee.find()
      .populate("department", "name")
      .populate("unit", "name");

    res.status(200).json({
      message: "All employees fetched successfully",
      data: employees
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error fetching employees" });
  }
};

exports.getAllUnits = async (req, res) => {
  try {
    const units = await Unit.find({ isActive: true });

    res.status(200).json({
      message: "All units fetched successfully",
      data: units
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error fetching units" });
  }
};

exports.getAllParentsByUnitId = async (req, res) => {
  try {
    const { unitId } = req.body;

    const matchStage = {
      parentFormId: null,
      isActive: true,
    };

    if (unitId) {
      matchStage.$or = [
        { unitAccess: { $exists: false } }, // no restriction
        { unitAccess: { $size: 0 } },       // empty array
        { unitAccess: new mongoose.Types.ObjectId(unitId) }
      ];
    }

    const menus = await MenuRegistry.aggregate([
      { $match: matchStage },
      { $sort: { sortOrder: 1 } },
      {
        $project: {
          _id: 0,
          formId: 1,
          title: 1,
          sortOrder: 1
        }
      }
    ]);

    return res.status(200).json({
      message: "Parent menus fetched successfully.",
      data: menus
    });

  } catch (error) {
    console.error(error);
    return res.status(500).json({
      message: "Error fetching menus",
      error: error.message
    });
  }
};
