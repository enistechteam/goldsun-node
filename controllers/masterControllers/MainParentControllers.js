const MainParentProduct = require('../../models/masterModels/MainParent');
const ParentProduct = require('../../models/masterModels/ParentProduct');
const ChildProduct = require('../../models/masterModels/ChildProduct');
const mongoose = require('mongoose');

// helper to calculate available MP stock
async function calculateMainParentStock(parentProducts, unitId) {
  let minPossibleUnits = Infinity;

  for (const config of parentProducts) {
    const pp = await ParentProduct.findById(config.parentProductId);
    if (!pp) { minPossibleUnits = 0; break; }

    const stockByUnit = pp.stockByUnit.find(
      (s) => s.unitId?.toString() === unitId
    );

    const available = stockByUnit?.totalPPQuantity || 0; // ✅ keep consistent with addStock flow

    if (config.quantity <= 0) { 
      minPossibleUnits = 0;
      break;
    }

    const possibleUnits = Math.floor(available / config.quantity);
    minPossibleUnits = Math.min(minPossibleUnits, possibleUnits);
  }

  return (minPossibleUnits === Infinity ? 0 : minPossibleUnits);
}

exports.createMainParentProduct = async (req, res) => {
  try {
    const {
      mainParentProductName,
      unitId,
      parentProducts,
      description,
      isActive
    } = req.body;

    // check for existing name
    const existing = await MainParentProduct.findOne({ mainParentProductName });
    if (existing) {
      return res.status(400).json({ message: "Main Parent Product name already exists" });
    }

    // transform parentProducts
    const parentProductsMapped = parentProducts.map(parent => ({
      parentProductId: parent.parentProductId,
      quantity: Number(parent.quantity) || 0
    }));

    // generate code
    const lastProduct = await MainParentProduct.findOne({
      mainParentProductCode: { $regex: /^MP\d{7}$/ }
    })
      .sort({ mainParentProductCode: -1 })
      .collation({ locale: "en", numericOrdering: true });

    let mainParentProductCode = "MP0000001";
    if (lastProduct?.mainParentProductCode) {
      const lastCode = lastProduct.mainParentProductCode;
      const numericPart = parseInt(lastCode.slice(2), 10);
      const nextNumber = numericPart + 1;
      mainParentProductCode = `MP${nextNumber.toString().padStart(7, "0")}`;
    }

    // ✅ calculate stock based on parentProducts
    const minPossibleUnits = await calculateMainParentStock(parentProductsMapped, unitId);

    const stockByUnit = [
      {
        unitId,
        totalMPQuantity: minPossibleUnits,
        committedMPQuantity: 0,
        availableToCommitMPQuantity: minPossibleUnits
      }
    ];

    const mainParent = new MainParentProduct({
      mainParentProductCode,
      mainParentProductName,
      parentProducts: parentProductsMapped,
      stockByUnit,
      description,
      isActive
    });

    await mainParent.save();

    res.status(201).json({
      message: "Main Parent Product created successfully with stock calculated.",
      data: mainParent
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
};

exports.updateMainParentProduct = async (req, res) => {
  try {
    const {
      _id,
      mainParentProductCode,
      mainParentProductName,
      parentProducts,
      description,
      isActive,
      unitId
    } = req.body;

    if (!unitId) {
      return res.status(400).json({ message: "unitId is required to recalculate stock." });
    }

    // update details
    const mainProduct = await MainParentProduct.findByIdAndUpdate(
      _id,
      {
        mainParentProductCode,
        mainParentProductName,
        parentProducts,
        description,
        isActive
      },
      { new: true }
    );

    if (!mainProduct) {
      return res.status(404).json({ message: "Main Parent Product not found." });
    }

    // ✅ recalc stock
    const minPossibleUnits = await calculateMainParentStock(mainProduct.parentProducts, unitId);

    if (!mainProduct.stockByUnit) mainProduct.stockByUnit = [];

    let mpStock = mainProduct.stockByUnit.find(s => s.unitId?.toString() === unitId);
    if (!mpStock) {
      mainProduct.stockByUnit.push({
        unitId,
        totalMPQuantity: minPossibleUnits,
        committedMPQuantity: 0,
        availableToCommitMPQuantity: minPossibleUnits
      });
    } else {
      mpStock.totalMPQuantity = minPossibleUnits;
      mpStock.availableToCommitMPQuantity = minPossibleUnits - (mpStock.committedMPQuantity || 0);
    }

    mainProduct.markModified("stockByUnit");
    await mainProduct.save();

    res.status(200).json({
      message: "Main Parent Product updated and stock recalculated successfully.",
      data: mainProduct
    });
  } catch (err) {
    console.error("🔥 ERROR:", err);
    res.status(500).json({ message: err.message || "Internal server error." });
  }
};



// DELETE Main Parent Product
exports.deleteMainParentProduct = async (req, res) => {
  try {
    const { _id } = req.body;

    const mainProduct = await MainParentProduct.findById(_id);
    if (!mainProduct)
      return res.status(404).json({ message: 'Main Parent Product not found' });

    mainProduct.isActive = false;
    await mainProduct.save();

    res.status(200).json({ message: 'Main Parent Product deleted successfully' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET ALL Main Parent Products (filtered stock counts by unitId)
exports.getAllMainParentProducts = async (req, res) => {
  try {
    const { unitId} = req.body;
    if (!unitId) {
      return res.status(400).json({
        message: "unitId is required to fetch main parent products."
      });
    }
const pipeline = []
    const unitObjectId = new mongoose.Types.ObjectId(unitId);
pipeline.push(
  // Match active products
  {
    $match: {
      isActive: true
    }
  },

  // Extract stock for requested unit
  {
    $addFields: {
      stockForUnit: {
        $filter: {
          input: "$stockByUnit",
          as: "s",
          cond: {
            $eq: ["$$s.unitId", unitObjectId]
          }
        }
      }
    }
  },

  {
    $addFields: {
      stockForUnit: { $arrayElemAt: ["$stockForUnit", 0] }
    }
  },

  {
    $addFields: {
      totalMPQuantity: {
        $ifNull: ["$stockForUnit.totalMPQuantity", 0]
      },
      committedMPQuantity: {
        $ifNull: ["$stockForUnit.committedMPQuantity", 0]
      },
      availableToCommitMPQuantity: {
        $ifNull: ["$stockForUnit.availableToCommitMPQuantity", 0]
      }
    }
  },

  // Lookup unit
  {
    $lookup: {
      from: "units",
      localField: "stockForUnit.unitId",
      foreignField: "_id",
      as: "unit"
    }
  },
  {
    $unwind: {
      path: "$unit",
      preserveNullAndEmptyArrays: true
    }
  },

  // Lookup details for all parent products in one step
  {
    $lookup: {
      from: "parentproducts",
      localField: "parentProducts.parentProductId",
      foreignField: "_id",
      as: "parentProductDetails"
    }
  },

  // Rebuild parentProducts array with joined details
  {
    $addFields: {
parentProducts: {
  $map: {
    input: "$parentProducts",
    as: "pp",
    in: {
      parentProductId: "$$pp.parentProductId",
      quantity: "$$pp.quantity",
      parentProductCode: {
        $let: {
          vars: {
            match: {
              $first: {
                $filter: {
                  input: "$parentProductDetails",
                  as: "p",
                  cond: { $eq: ["$$p._id", "$$pp.parentProductId"] }
                }
              }
            }
          },
          in: "$$match.parentProductCode"
        }
      },
      parentProductName: {
        $let: {
          vars: {
            match: {
              $first: {
                $filter: {
                  input: "$parentProductDetails",
                  as: "p",
                  cond: { $eq: ["$$p._id", "$$pp.parentProductId"] }
                }
              }
            }
          },
          in: "$$match.parentProductName"
        }
      },
      availableToCommitPPQuantity: {
        $let: {
          vars: {
            match: {
              $first: {
                $filter: {
                  input: "$parentProductDetails",
                  as: "p",
                  cond: { $eq: ["$$p._id", "$$pp.parentProductId"] }
                }
              }
            },
            unitObjectId: unitObjectId
          },
          in: {
            $let: {
              vars: {
                stockMatch: {
                  $first: {
                    $filter: {
                      input: "$$match.stockByUnit",
                      as: "s",
                      cond: { $eq: ["$$s.unitId", "$$unitObjectId"] }
                    }
                  }
                }
              },
              in: { $ifNull: ["$$stockMatch.availableToCommitPPQuantity", 0] }
            }
          }
        }
      }
    }
  }
}
    }
  },

  // Final projection
  {
    $project: {
      _id: 0,
      isActive:1,
      mainParentProductId: "$_id",
      mainParentProductCode: 1,
      mainParentProductName: 1,
      totalMPQuantity: 1,
      committedMPQuantity: 1,
      availableToCommitMPQuantity: 1,
      unitId: "$unit._id",
      unitName: "$unit.unitName",
      createdAt: 1,
      updatedAt: 1,
      parentProducts: 1
    }
  },

  {
    $sort: { mainParentProductCode: 1 }
  }
  // {
  //   $limit: 500
  // }
)
const products = await MainParentProduct.aggregate(pipeline);

    res.status(200).json(products);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
};

// GET ALL Main Parent Products (filtered stock counts by unitId)
exports.getMainParentProducts = async (req, res) => {
  try {
    const {mainParentProductName} =  req.body
    const filter = {isActive: true };

      if (mainParentProductName && mainParentProductName.trim() !== '') {
      const safePattern = escapeRegex(mainParentProductName.trim());
      filter.mainParentProductName = { $regex: safePattern, $options: 'i' }; // Case-insensitive
    }
    const products = await MainParentProduct.find(filter)
      .sort({ mainParentProductCode: 1 }).limit(50)
      

    res.status(200).json(products);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};


exports.getMainParentsByName = async (req, res) => {
  try {
    const { unitId ,mainParentProductName,from} = req.body;
     const filter = {};
if(from==='AddStock'){
  filter.isActive=true
}
 if (mainParentProductName && mainParentProductName.trim() !== '') {
      const safePattern = escapeRegex(mainParentProductName.trim());
      filter.mainParentProductName = { $regex: safePattern, $options: 'i' }; // Case-insensitive
    }
    if (!unitId) {
      return res.status(400).json({
        message: "unitId is required to fetch main parent products."
      });
    }

    const unitObjectId = new mongoose.Types.ObjectId(unitId);

const products = await MainParentProduct.aggregate([
  // Match active products
  {
    $match: filter
  },

  // Extract stock for requested unit
  {
    $addFields: {
      stockForUnit: {
        $filter: {
          input: "$stockByUnit",
          as: "s",
          cond: {
            $eq: ["$$s.unitId", unitObjectId]
          }
        }
      }
    }
  },

  {
    $addFields: {
      stockForUnit: { $arrayElemAt: ["$stockForUnit", 0] }
    }
  },

  {
    $addFields: {
      totalMPQuantity: {
        $ifNull: ["$stockForUnit.totalMPQuantity", 0]
      },
      committedMPQuantity: {
        $ifNull: ["$stockForUnit.committedMPQuantity", 0]
      },
      availableToCommitMPQuantity: {
        $ifNull: ["$stockForUnit.availableToCommitMPQuantity", 0]
      }
    }
  },

  // Lookup unit
  {
    $lookup: {
      from: "units",
      localField: "stockForUnit.unitId",
      foreignField: "_id",
      as: "unit"
    }
  },
  {
    $unwind: {
      path: "$unit",
      preserveNullAndEmptyArrays: true
    }
  },

  // Lookup details for all parent products in one step
  {
    $lookup: {
      from: "parentproducts",
      localField: "parentProducts.parentProductId",
      foreignField: "_id",
      as: "parentProductDetails"
    }
  },

  // Rebuild parentProducts array with joined details
  {
    $addFields: {
      parentProducts: {
        $map: {
          input: "$parentProducts",
          as: "pp",
          in: {
            parentProductId: "$$pp.parentProductId",
            quantity: "$$pp.quantity",
            parentProductCode: {
              $let: {
                vars: {
                  match: {
                    $first: {
                      $filter: {
                        input: "$parentProductDetails",
                        as: "p",
                        cond: { $eq: ["$$p._id", "$$pp.parentProductId"] }
                      }
                    }
                  }
                },
                in: "$$match.parentProductCode"
              }
            },
            parentProductName: {
              $let: {
                vars: {
                  match: {
                    $first: {
                      $filter: {
                        input: "$parentProductDetails",
                        as: "p",
                        cond: { $eq: ["$$p._id", "$$pp.parentProductId"] }
                      }
                    }
                  }
                },
                in: "$$match.parentProductName"
              }
            },
availableToCommitPPQuantity: {
  $let: {
    vars: {
      match: {
        $first: {
          $filter: {
            input: "$parentProductDetails",
            as: "p",
            cond: { $eq: ["$$p._id", "$$pp.parentProductId"] }
          }
        }
      }
    },
    in: {
      $let: {
        vars: {
          stockMatch: {
            $first: {
              $filter: {
                input: "$$match.stockByUnit",
                as: "s",
                cond: { $eq: ["$$s.unitId", unitObjectId] } // <-- use unitObjectId here
              }
            }
          }
        },
        in: { $ifNull: ["$$stockMatch.availableToCommitPPQuantity", 0] }
      }
    }
  }
}


            // availableToCommitPPQuantity:"$parentProductDetails.stockByUnit.availableToCommitPPQuantity"
          }
        }
      }
    }
  },

  // Final projection
  {
    $project: {
      _id: 1,
      isActive:1,
      mainParentProductId: "$_id",
      mainParentProductCode: 1,
      mainParentProductName: 1,
      totalMPQuantity: 1,
      committedMPQuantity: 1,
      availableToCommitMPQuantity: 1,
      unitId: "$unit._id",
      unitName: "$unit.unitName",
      createdAt: 1,
      updatedAt: 1,
      parentProducts: 1
    }
  },

  {
    $sort: { createdAt: -1 }
  }
]);


    res.status(200).json(products);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
};


function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // Escape all special regex chars
}

// GET ALL Parent Products
exports.getAllParentProducts = async (req, res) => {
  try {
    const {parentProductName} =  req.body
    const filter = {isActive: true };

      if (parentProductName && parentProductName.trim() !== '') {
      const safePattern = escapeRegex(parentProductName.trim());
      filter.parentProductName = { $regex: safePattern, $options: 'i' }; // Case-insensitive
    }
    const products = await ParentProduct.find(filter)
      .sort({ parentProductCode: 1 }).limit(50)
      // .populate({
      //   path: 'childProducts.childProductId',
      //   select:
      //     'childProductName childProductCode totalCPQuantity committedCPQuantity availableToCommitCPQuantity'
      // });

    res.status(200).json(products);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

