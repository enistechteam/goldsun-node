const ParentProduct = require('../../models/masterModels/ParentProduct');
const ChildProduct = require('../../models/masterModels/ChildProduct');
const mongoose = require('mongoose');

// CREATE Parent Product
exports.createParentProduct = async (req, res) => {
  try {
    const {
      parentProductName,
      childProducts = [],
      description,
      isActive
    } = req.body;

    const existing = await ParentProduct.findOne({ parentProductName });
    if (existing) {
      return res.status(400).json({ message: 'Parent product name already exists' });
    }

    const lastProduct = await ParentProduct.findOne({
      parentProductCode: { $regex: /^PP\d{7}$/ }
    })
      .sort({ parentProductCode: -1 })
      .collation({ locale: 'en', numericOrdering: true });

    let parentProductCode = 'PP0000001';
    if (lastProduct && lastProduct.parentProductCode) {
      const lastCode = lastProduct.parentProductCode;
      const numericPart = parseInt(lastCode.slice(2));
      const nextNumber = numericPart + 1;
      parentProductCode = `PP${nextNumber.toString().padStart(7, '0')}`;
    }

    const parentProduct = new ParentProduct({
      parentProductCode,
      parentProductName,
      childProducts,
      stockByUnit: [],
      description,
      isActive
    });

    await parentProduct.save();

    res.status(200).json({
      message: 'Parent product created successfully',
      data: parentProduct._id
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.insertManyParentProducts = async (req, res) => {
  try {
    const {parentProducts} = req.body; // Expecting an array of parent products

    if (!Array.isArray(parentProducts) || parentProducts.length === 0) {
      return res.status(400).json({ message: 'Invalid input: Array of parent products expected' });
    }

    // Fetch the last used parentProductCode
    const lastProduct = await ParentProduct.findOne({
      parentProductCode: { $regex: /^PP\d{7}$/ }
    })
      .sort({ parentProductCode: -1 })
      .collation({ locale: 'en', numericOrdering: true });

    let currentNumber = 1;
    if (lastProduct && lastProduct.parentProductCode) {
      const lastCode = lastProduct.parentProductCode;
      const numericPart = parseInt(lastCode.slice(2));
      currentNumber = numericPart + 1;
    }

    const toInsert = [];

    for (const item of parentProducts) {
      const { parentProductName, childProducts = [], description, isActive } = item;

      // Optional: skip if name already exists
      const existing = await ParentProduct.findOne({ parentProductName });
      if (existing) continue;

      const parentProductCode = `PP${currentNumber.toString().padStart(7, '0')}`;
      currentNumber++;

      toInsert.push({
        parentProductCode,
        parentProductName,
        childProducts,
        stockByUnit: [],
        description,
        isActive
      });
    }

    if (toInsert.length === 0) {
      return res.status(400).json({ message: 'All parent product names already exist or input is invalid' });
    }

    const result = await ParentProduct.insertMany(toInsert);

    res.status(200).json({
      message: `${result.length} Parent products inserted successfully`,
      data: result.map(p => p._id)
    });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// UPDATE Parent Product
exports.updateParentProduct = async (req, res) => {
  try {
    const {
      _id,
      unitId,
      parentProductCode,
      parentProductName,
      childProducts = [],
      description,
      isActive,
      totalPPQuantity,
      committedPPQuantity
    } = req.body;

    const parent = await ParentProduct.findById(_id);
    if (!parent) {
      return res.status(400).json({ message: 'Parent product not found' });
    }

    if (parentProductCode !== undefined) {
      parent.parentProductCode = parentProductCode;
    }
    if (parentProductName !== undefined) {
      parent.parentProductName = parentProductName;
    }
    if (childProducts !== undefined) {
      parent.childProducts = childProducts;
    }
    if (description !== undefined) {
      parent.description = description;
    }
    if (isActive !== undefined) {
      parent.isActive = isActive;
    }

    if (unitId) {
      let unitStock = parent.stockByUnit.find(
        (s) => s.unitId.toString() === unitId
      );

      if (!unitStock) {
        unitStock = {
          unitId,
          totalPPQuantity: 0,
          committedPPQuantity: 0,
          availableToCommitPPQuantity: 0
        };
        parent.stockByUnit.push(unitStock);
      }

      if (totalPPQuantity !== undefined) {
        unitStock.totalPPQuantity = totalPPQuantity;
      }
      if (committedPPQuantity !== undefined) {
        unitStock.committedPPQuantity = committedPPQuantity;
      }

      unitStock.availableToCommitPPQuantity =
        unitStock.totalPPQuantity - unitStock.committedPPQuantity;
    }

    await parent.save();

    res.status(200).json({
      message: 'Parent product updated successfully',
      data: parent
    });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// DELETE (soft delete) Parent Product
exports.deleteParentProduct = async (req, res) => {
  try {
    const { _id, unitId } = req.body;

    const parent = await ParentProduct.findById(_id);
    if (!parent) return res.status(400).json({ message: 'Parent product not found' });

    const unitStock = parent.stockByUnit.find(
      (s) => s.unitId.toString() === unitId
    );

    if (unitStock) {
      for (const cp of parent.childProducts) {
        const rollbackQty = unitStock.totalPPQuantity * cp.quantity;
        await ChildProduct.updateOne(
          { _id: cp.childProductId },
          {
            $inc: {
              committedCPQuantity: -rollbackQty,
              availableToCommitCPQuantity: rollbackQty
            }
          }
        );
      }
    }

    parent.isActive = false;
    await parent.save();

    res.status(200).json({
      message: 'Parent product deactivated and child quantities restored'
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // Escape all special regex chars
}
// GET ALL Parent Products filtered by unitId
exports.getAllParentProducts = async (req, res) => {
  try {
    const { unitId ,parentProductName} = req.body;
let filter={}
if (parentProductName && parentProductName.trim() !== '') {
      const safePattern = escapeRegex(parentProductName.trim());
      filter.parentProductName = { $regex: safePattern, $options: 'i' }; // Case-insensitive
    }
    if (!unitId) {
      return res.status(400).json({
        message: "unitId is required to fetch parent products.",
      });
    }

    const unitObjectId = new mongoose.Types.ObjectId(unitId);

    const parent = await ParentProduct.aggregate([
      { $match: filter },

      // Filter stockByUnit for the requested unit
      {
        $addFields: {
          stockByUnit: {
            $filter: {
              input: "$stockByUnit",
              as: "s",
              cond: { $eq: ["$$s.unitId", unitObjectId] },
            },
          },
        },
      },

      // Extract first matching stock record
      {
        $addFields: {
          stockForUnit: { $arrayElemAt: ["$stockByUnit", 0] },
        },
      },

      // Assign default 0s if missing
      {
        $addFields: {
          totalPPQuantity: {
            $ifNull: ["$stockForUnit.totalPPQuantity", 0],
          },
          committedPPQuantity: {
            $ifNull: ["$stockForUnit.committedPPQuantity", 0],
          },
          availableToCommitPPQuantity: {
            $ifNull: ["$stockForUnit.availableToCommitPPQuantity", 0],
          },
        },
      },

      // Lookup unit name
      {
        $lookup: {
          from: "units",
          localField: "stockByUnit.unitId",
          foreignField: "_id",
          as: "unit",
        },
      },
      {
        $unwind: {
          path: "$unit",
          preserveNullAndEmptyArrays: true,
        },
      },

      // Unwind child products for lookup
      {
        $unwind: {
          path: "$childProducts",
          preserveNullAndEmptyArrays: true,
        },
      },

      // Lookup child product details
      {
        $lookup: {
          from: "childproducts",
          localField: "childProducts.childProductId",
          foreignField: "_id",
          as: "childProductDetails",
        },
      },
      {
        $unwind: {
          path: "$childProductDetails",
          preserveNullAndEmptyArrays: true,
        },
      },

      // Group back the child products array
      {
        $group: {
          _id: "$_id",
          parentProductCode: { $first: "$parentProductCode" },
          parentProductName: { $first: "$parentProductName" },
          totalPPQuantity: { $first: "$totalPPQuantity" },
          committedPPQuantity: { $first: "$committedPPQuantity" },
          availableToCommitPPQuantity: { $first: "$availableToCommitPPQuantity" },
          description: { $first: "$description" },
          isActive: { $first: "$isActive" },
          createdAt: { $first: "$createdAt" },
          updatedAt: { $first: "$updatedAt" },
          unit: { $first: "$unit" },
          childProducts: {
            $push: {
              childProductId: "$childProducts.childProductId",
              quantity: "$childProducts.quantity",
              childProductName: "$childProductDetails.childProductName",
            },
          },
        },
      },

      // Project the desired fields
      {
        $project: {
          _id: 1,
          parentProductCode: 1,
          parentProductName: 1,
          totalPPQuantity: 1,
          committedPPQuantity: 1,
          availableToCommitPPQuantity: 1,
          description: 1,
          isActive: 1,
          createdAt: 1,
          updatedAt: 1,
          unitId: "$unit._id",
          unitName: "$unit.name",
          childProducts: {
            $filter: {
              input: "$childProducts",
              as: "cp",
              cond: { $ne: ["$$cp.childProductId", null] },
            },
          },
        },
      },

      { $sort: { parentProductCode: -1 } }
      
  // {
  //   $limit: 500
  // }
    ]);

    res.status(200).json(parent);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
};

// Get All Child Products remains unchanged — this is the same as your updated one
exports.getAllChildProducts = async (req, res) => {
  try {
    const { unitId } = req.body;
    const matchstage = { isActive: true};

    const products = await ChildProduct.aggregate([
      { $match: matchstage },

      {
        $addFields: {
          stockByUnit: {
            $filter: {
              input: '$stockByUnit',
              as: 's',
              cond: {
                $eq: ['$$s.unitId', new mongoose.Types.ObjectId(unitId)]
              }
            }
          }
        }
      },

      { $unwind: { path: '$stockByUnit', preserveNullAndEmptyArrays: true } },

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