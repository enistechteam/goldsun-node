const Category = require('../../models/masterModels/Category');

exports.createCategory = async (req, res) => {
  try {
    const { unitId, categoryCode, categoryName, description, isActive } = req.body;

    const existing = await Category.findOne({ categoryCode });
    if (existing) return res.status(400).json({ message: 'Category code already exists' });

    const category = new Category({ unitId, categoryCode, categoryName, description, isActive });
    await category.save();

    res.status(200).json({ message: 'Category created successfully', data: category._id });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getAllCategories = async (req, res) => {
  try {
    const { unitId } = req.body;
    const filter = unitId ? { unitId } : {};

    const categories = await Category.find(filter).sort({ createdAt: -1 }).populate('unitId', '_id name');
    res.status(200).json(categories);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.updateCategory = async (req, res) => {
  try {
    const { _id, unitId, categoryCode, categoryName, description, isActive } = req.body;

    const updated = await Category.findByIdAndUpdate(
      _id,
      { unitId, categoryCode, categoryName, description, isActive },
      { new: true, runValidators: true }
    );

    if (!updated) return res.status(400).json({ message: 'Category not found' });

    res.status(200).json({ message: 'Category updated successfully', data: updated });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}


exports.deleteCategory = async (req, res) => {
  try {
    const { _id } = req.body;

    const deleted = await Category.findByIdAndUpdate(_id, { isActive: false }, { new: true });
    if (!deleted) return res.status(400).json({ message: 'Category not found' });

    res.status(200).json({ message: 'Category deactivated successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
