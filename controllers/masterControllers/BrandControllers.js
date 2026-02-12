const Brand = require('../../models/masterModels/Brand');
require('dotenv').config();
exports.createBrand = async (req, res) => {
  try {
    const { unitId, brandCode, brandName, description, isActive } = req.body;

    const existing = await Brand.findOne({ brandCode });
    if (existing) return res.status(400).json({ message: 'Brand code already exists' });

    const brand = new Brand({ unitId, brandCode, brandName, description, isActive });
    await brand.save();

    res.status(200).json({ message: 'Brand created successfully', data: brand._id });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getAllBrands = async (req, res) => {
  try {
    const { unitId } = req.body;
    const filter = unitId ? { unitId } : {};
    
    const brands = await Brand.find(filter).sort({ createdAt: -1 }).populate('unitId', '_id name');
    res.status(200).json(brands);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.updateBrand = async (req, res) => {
  try {
    const { _id, unitId, brandCode, brandName, description, isActive } = req.body;

    const updated = await Brand.findByIdAndUpdate(
      _id,
      { unitId, brandCode, brandName, description, isActive },
      { new: true, runValidators: true }
    );

    if (!updated) return res.status(400).json({ message: 'Brand not found' });

    res.status(200).json({ message: 'Brand updated successfully', data: updated });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.deleteBrand = async (req, res) => {
  try {
    const { _id } = req.body;

    const deleted = await Brand.findByIdAndUpdate(_id, { isActive: false }, { new: true });
    if (!deleted) return res.status(400).json({ message: 'Brand not found' });

    res.status(200).json({ message: 'Brand deactivated successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
