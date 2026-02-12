const Department = require('../../models/masterModels/Department');

exports.createDepartment = async (req, res) => {
  try {
    const {DepartmentCode, DepartmentName, unitId, isActive } = req.body;

    const existing = await Department.findOne({ DepartmentName, unitId });
    if (existing) {
      return res.status(400).json({ message: 'Department already exists for this unit' });
    }

    const department = new Department({DepartmentCode, DepartmentName, unitId, isActive });
    await department.save();

    res.status(200).json({ message: 'Department created successfully', data: department._id });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getAllDepartments = async (req, res) => {
  const { unitId } = req.body;
    const filter = unitId ? { unitId } : {};
  try {
    const departments = await Department.find(filter).sort({ createdAt: -1 })
      .populate({
        path: 'unitId',
        select: '_id name'
      });

    res.status(200).json(departments);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getDepartmentByName = async (req, res) => {
  try {
    const department = await Department.findOne({ DepartmentName: req.params.DepartmentName })
      .populate({
        path: 'unitId',
        select: '_id name'
      });

    if (!department) {
      return res.status(400).json({ message: 'Department not found' });
    }

    res.status(200).json(department);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.updateDepartment = async (req, res) => {
  try {
    const { _id,DepartmentCode, DepartmentName, unitId, isActive } = req.body;

    const department = await Department.findByIdAndUpdate(
      _id,
      { DepartmentCode, DepartmentName, unitId, isActive },
      { new: true, runValidators: true }
    ).populate({
      path: 'unitId',
      select: '_id name'
    });

    if (!department) {
      return res.status(400).json({ message: 'Department not found' });
    }

    res.status(200).json({ message: 'Department updated successfully', data: department });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.deleteDepartment = async (req, res) => {
  try {
    const { _id } = req.body;

    const department = await Department.findByIdAndUpdate(
      _id,
      { isActive: false },
      { new: true }
    );

    if (!department) {
      return res.status(400).json({ message: 'Department not found' });
    }

    res.status(200).json({ message: 'Department deactivated successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
