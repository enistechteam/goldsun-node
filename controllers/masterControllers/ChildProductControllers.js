const ChildProduct = require('../../models/masterModels/ChildProduct');
const Category = require('../../models/masterModels/Category');
const mongoose = require('mongoose');

// ✅ Create Child Product
exports.createChildProduct = async (req, res) => {
  try {
    const {
      categoryId,
      childProductName,
      description,
      isActive
    } = req.body;

    const existing = await ChildProduct.findOne({ childProductName, categoryId });
    if (existing) return res.status(400).json({ message: 'Child product already exists' });

    const lastProduct = await ChildProduct.findOne({
      childProductCode: { $regex: /^CP\d{7}$/ }
    })
      .sort({ childProductCode: -1 })
      .collation({ locale: 'en', numericOrdering: true });

    let childProductCode = 'CP0000001';
    if (lastProduct && lastProduct.childProductCode) {
      const lastCode = lastProduct.childProductCode;
      const numericPart = parseInt(lastCode.slice(2));
      const nextNumber = numericPart + 1;
      childProductCode = `CP${nextNumber.toString().padStart(7, '0')}`;
    }

    const product = new ChildProduct({
      childProductCode,
      childProductName,
      categoryId,
      stockByUnit: [], // empty initially
      description,
      isActive
    });

    await product.save();

    res.status(200).json({
      message: 'Child product created successfully',
      data: product._id
    });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ✅ Get All Child Products (filtered by unitId)
exports.getAllChildProducts = async (req, res) => {
  try {
    const { unitId } = req.body;
    if (!unitId) return res.status(400).json({ message: 'Unit ID is required' });

    const products = await ChildProduct.aggregate([
      { $match: { isActive: true } },

      {
        $addFields: {
          stockByUnit: {
            $filter: {
              input: "$stockByUnit",
              as: "unitStock",
              cond: { $eq: ["$$unitStock.unitId", new mongoose.Types.ObjectId(unitId)] }
            }
          }
        }
      },

      { $unwind: { path: "$stockByUnit", preserveNullAndEmptyArrays: true } },

      {
        $lookup: {
          from: 'units',
          localField: 'stockByUnit.unitId',
          foreignField: '_id',
          as: 'unit'
        }
      },
      { $unwind: { path: '$unit', preserveNullAndEmptyArrays: true } },

      {
        $lookup: {
          from: 'categories',
          localField: 'categoryId',
          foreignField: '_id',
          as: 'category'
        }
      },
      { $unwind: { path: '$category', preserveNullAndEmptyArrays: true } },

      {
        $project: {
          _id: 1,
          childProductCode: 1,
          childProductName: 1,
          isActive: 1,
          unitId: '$unit._id',
          unitName: '$unit.name',
          categoryId: '$category._id',
          CategoryName: '$category.categoryName',
          totalCPQuantity: '$stockByUnit.totalCPQuantity',
          committedCPQuantity: '$stockByUnit.committedCPQuantity',
          availableToCommitCPQuantity: '$stockByUnit.availableToCommitCPQuantity',
          description: 1,
          createdAt: 1,
          updatedAt: 1
        }
      },

      { $sort: { createdAt: -1 } }
    ]);

    res.status(200).json(products);

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ✅ Update Child Product
exports.updateChildProduct = async (req, res) => {
  try {
    const { _id, unitId } = req.body;
    if (!_id) return res.status(400).json({ message: 'ID is required' });
    if (!unitId) return res.status(400).json({ message: 'Unit ID is required' });

    const product = await ChildProduct.findById(_id);
    if (!product) return res.status(404).json({ message: 'Child product not found' });

    let unitStock = product.stockByUnit.find(
      (s) => s.unitId.toString() === unitId
    );

    if (!unitStock) {
      unitStock = {
        unitId,
        totalCPQuantity: 0,
        committedCPQuantity: 0,
        availableToCommitCPQuantity: 0
      };
      product.stockByUnit.push(unitStock);
    }

    if (req.body.totalCPQuantity !== undefined) {
      unitStock.totalCPQuantity = req.body.totalCPQuantity;
    }
    if (req.body.committedCPQuantity !== undefined) {
      unitStock.committedCPQuantity = req.body.committedCPQuantity;
    }

    unitStock.availableToCommitCPQuantity =
      unitStock.totalCPQuantity - unitStock.committedCPQuantity;

    if (req.body.childProductCode !== undefined)
      product.childProductCode = req.body.childProductCode;
    if (req.body.childProductName !== undefined)
      product.childProductName = req.body.childProductName;
    if (req.body.categoryId !== undefined)
      product.categoryId = req.body.categoryId;
    if (req.body.description !== undefined)
      product.description = req.body.description;
    if (req.body.isActive !== undefined)
      product.isActive = req.body.isActive;

    await product.save();

    res.status(200).json({
      message: 'Child product updated successfully',
      data: product
    });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ✅ Delete (Deactivate) Child Product
exports.deleteChildProduct = async (req, res) => {
  try {
    const { _id } = req.body;

    const deleted = await ChildProduct.findByIdAndUpdate(
      _id,
      { isActive: false },
      { new: true }
    );
    if (!deleted) return res.status(400).json({ message: 'Child product not found' });

    res.status(200).json({ message: 'Child product deactivated successfully' });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ✅ Get all Categories (no unitId filter anymore)
exports.getAllCategorysByUnitId = async (req, res) => {
  try {
    const categorys = await Category.aggregate([
      { $match: { isActive: true } },
      {
        $project: {
          _id: 0,
          CategoryIDPK: '$_id',
          CategoryCode: '$categoryCode',
          CategoryName: '$categoryName',
        }
      },
      { $sort: { createdAt: -1 } }
    ]);

    res.status(200).json({
      message: 'Categorys fetched successfully',
      data: categorys
    });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
