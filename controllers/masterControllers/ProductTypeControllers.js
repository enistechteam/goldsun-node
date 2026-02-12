const ProductType = require('../../models/masterModels/ProductType');
require('dotenv').config();
exports.createProductType = async (req, res) => {
  try {
    const { unitId, productTypeCode, productTypeName, description, isActive } = req.body;

    const existing = await ProductType.findOne({ productTypeName });
    if (existing) return res.status(400).json({ message: 'Product Type Name already exists' });

    const productType = new ProductType({ unitId, productTypeCode, productTypeName, description, isActive });
    await productType.save();

    res.status(200).json({ message: 'Product Type created successfully', data: productType._id });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getAllProductTypes = async (req, res) => {
  try {
    const { unitId } = req.body;
    const filter = {isActive:true}
    // const filter = unitId ? { unitId } : {};
    
    const productTypes = await ProductType.find(filter).sort({ createdAt: -1 }).populate('unitId', '_id name');
    res.status(200).json(productTypes);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.updateProductType = async (req, res) => {
  try {
    const { _id, unitId, productTypeCode, productTypeName, description, isActive } = req.body;

    const updated = await ProductType.findByIdAndUpdate(
      _id,
      { unitId, productTypeCode, productTypeName, description, isActive },
      { new: true, runValidators: true }
    );

    if (!updated) return res.status(400).json({ message: 'Product Type not found' });

    res.status(200).json({ message: 'Product Type updated successfully', data: updated });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.deleteProductType = async (req, res) => {
  try {
    const { _id } = req.body;

    const deleted = await ProductType.findByIdAndUpdate(_id, { isActive: false }, { new: true });
    if (!deleted) return res.status(400).json({ message: 'Product Type not found' });

    res.status(200).json({ message: 'Product Type deactivated successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
