const ParentProduct = require('../../models/masterModels/ParentProduct');
const ChildProduct = require('../../models/masterModels/ChildProduct')
const MainParentProduct = require('../../models/masterModels/MainParent')
const mongoose = require('mongoose');

exports.shareProductsBetweenParents = async (req, res) => {
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const {
        unitId,
        transferQuantity,
        fromParentProducts,
        toParentProducts
      } = req.body;
      
      // ============================================
      // VALIDATION
      // ============================================
      if (!unitId) {
        throw new Error('unitId is required');
      }

      if (!transferQuantity || transferQuantity <= 0) {
        throw new Error('Invalid quantity provided');
      }

      if (!fromParentProducts || !Array.isArray(fromParentProducts) || fromParentProducts.length === 0) {
        throw new Error('fromParentProducts array is required and must not be empty');
      }

      if (!toParentProducts || !Array.isArray(toParentProducts) || toParentProducts.length === 0) {
        throw new Error('toParentProducts array is required and must not be empty');
      }

      // Check for duplicates in fromParentProducts
      const fromSet = new Set(fromParentProducts);
      if (fromSet.size !== fromParentProducts.length) {
        throw new Error('Duplicate entries found in fromParentProducts array');
      }

      // Check for duplicates in toParentProducts
      const toSet = new Set(toParentProducts);
      if (toSet.size !== toParentProducts.length) {
        throw new Error('Duplicate entries found in toParentProducts array');
      }

      // Check for overlap between from and to arrays
      const overlap = fromParentProducts.filter(id => toParentProducts.includes(id));
      if (overlap.length > 0) {
        throw new Error(`Cannot transfer to the same parent product. Overlapping IDs: ${overlap.join(', ')}`);
      }


      // ============================================
      // FETCH ALL PARENT PRODUCTS
      // ============================================

      const allParentIds = [...fromParentProducts, ...toParentProducts];
      const allParents = await ParentProduct.find({
        _id: { $in: allParentIds }
      }).session(session);

      if (allParents.length !== allParentIds.length) {
        const foundIds = allParents.map(p => p._id.toString());
        const missingIds = allParentIds.filter(id => !foundIds.includes(id));
        throw new Error(`Parent product(s) not found: ${missingIds.join(', ')}`);
      }

      const parentMap = new Map(allParents.map(p => [p._id.toString(), p]));

      // ============================================
      // CALCULATE QUANTITIES
      // ============================================
      const fromCount = fromParentProducts.length;
      const toCount = toParentProducts.length;

      // Each FROM parent will lose the FULL transfer quantity
      const deductPerFromParent = transferQuantity;

      // Each TO parent will gain the FULL transfer quantity
      const addPerToParent = transferQuantity;

      // ============================================
      // DEDUCT FROM SOURCE PARENTS
      // ============================================

      for (const parentId of fromParentProducts) {
        const parent = parentMap.get(parentId);

        const stockIndex = parent.stockByUnit.findIndex(
          s => s.unitId?.toString() === unitId
        );

        if (stockIndex === -1) {
          throw new Error(`Parent product ${parent.parentProductName} has no stock for unit ${unitId}`);
        }

        const stock = parent.stockByUnit[stockIndex];

        if (stock.availableToCommitPPQuantity < deductPerFromParent) {
          throw new Error(
            `Insufficient stock in ${parent.parentProductName}. ` +
            `Available: ${stock.availableToCommitPPQuantity}, Required: ${deductPerFromParent}`
          );
        }

        // Deduct stock
        parent.stockByUnit[stockIndex].totalPPQuantity -= deductPerFromParent;
        parent.stockByUnit[stockIndex].availableToCommitPPQuantity -= deductPerFromParent;

        await parent.save({ session });
      }

      // ============================================
      // ADD TO DESTINATION PARENTS
      // ============================================

      for (const parentId of toParentProducts) {
        const parent = parentMap.get(parentId);

        const stockIndex = parent.stockByUnit.findIndex(
          s => s.unitId?.toString() === unitId
        );

        if (stockIndex === -1) {
          // Create new stock entry
          parent.stockByUnit.push({
            unitId: new mongoose.Types.ObjectId(unitId),
            totalPPQuantity: addPerToParent,
            committedPPQuantity: 0,
            availableToCommitPPQuantity: addPerToParent
          });
        } else {
          // Update existing stock
          const oldStock = parent.stockByUnit[stockIndex].availableToCommitPPQuantity;
          parent.stockByUnit[stockIndex].totalPPQuantity += addPerToParent;
          parent.stockByUnit[stockIndex].availableToCommitPPQuantity += addPerToParent;
          const newStock = parent.stockByUnit[stockIndex].availableToCommitPPQuantity;
        }

        await parent.save({ session });
      }
      // ============================================
      // RECALCULATE MAIN PARENT PRODUCTS
      // ============================================

      // Find all MainParents that depend on ANY of the affected parent products
      const affectedParentIds = [...fromParentProducts, ...toParentProducts];
      
      const mainParents = await MainParentProduct.find({
        'parentProducts.parentProductId': { $in: affectedParentIds }
      }).session(session);

      if (mainParents.length > 0) {
        // Fetch all required parent products for recalculation
        const allRequiredParentIds = new Set();
        mainParents.forEach(mp => {
          mp.parentProducts.forEach(pp => {
            allRequiredParentIds.add(pp.parentProductId.toString());
          });
        });

        const parentsForRecalc = await ParentProduct.find({
          _id: { $in: Array.from(allRequiredParentIds) }
        }).session(session);

        const parentRecalcMap = new Map(
          parentsForRecalc.map(p => [p._id.toString(), p])
        );

        // Recalculate each MainParent
        for (const mainParent of mainParents) {

          let minBuildable = Infinity;

          // Calculate minimum buildable quantity
          for (const { parentProductId, quantity } of mainParent.parentProducts) {
            const ppDoc = parentRecalcMap.get(parentProductId.toString());
            if (!ppDoc) {
              throw new Error(
                `Parent product not found during recalculation: ${parentProductId}`
              );
            }

            const ppStock = ppDoc.stockByUnit.find(
              s => s.unitId.toString() === unitId.toString()
            );
            const available = ppStock?.availableToCommitPPQuantity || 0;
            const possibleQuantity = Math.floor(available / quantity);

            minBuildable = Math.min(minBuildable, possibleQuantity);
          }

          const calculatedStock = minBuildable === Infinity ? 0 : minBuildable;

          // Update MainParent stock
          let mpStock = mainParent.stockByUnit.find(
            s => s.unitId.toString() === unitId.toString()
          );

          if (!mpStock) {
            mainParent.stockByUnit.push({
              unitId: new mongoose.Types.ObjectId(unitId),
              totalMPQuantity: calculatedStock,
              availableToCommitMPQuantity: calculatedStock,
              committedMPQuantity: 0
            });
          } else {
            const oldStock = mpStock.availableToCommitMPQuantity;
            mpStock.totalMPQuantity = calculatedStock;
            mpStock.availableToCommitMPQuantity = calculatedStock;
          }

          await mainParent.save({ session });
        }

      }
      res.status(200).json({
        success: true,
        message: 'Parent product stock transferred successfully.',
        data: {
          transferredQuantity: transferQuantity,
          deductPerFromParent,
          addPerToParent,
          fromParentsCount: fromCount,
          toParentsCount: toCount,
          totalDeducted: deductPerFromParent * fromCount,
          totalAdded: addPerToParent * toCount,
          affectedMainParents: mainParents.length
        }
      });
    }, {
      readPreference: 'primary',
      readConcern: { level: 'local' },
      writeConcern: { w: 'majority' },
      maxCommitTimeMS: 60000
    });

  } catch (error) {
    console.error('\n❌ ===== TRANSACTION FAILED - ROLLING BACK =====');
    console.error('🕐 Error Time:', new Date().toISOString());
    console.error('Error Name:', error.name);
    console.error('Error Message:', error.message);
    console.error('Error Stack:', error.stack);

    const statusCode = error.message.includes('not found') ||
                       error.message.includes('Invalid') ||
                       error.message.includes('Insufficient') ||
                       error.message.includes('required') ? 400 : 500;

    res.status(statusCode).json({
      success: false,
      message: error.message || 'Server error'
    });
  } finally {
    await session.endSession();
  }
};

exports.getAllMainParentProducts = async (req, res) => {
  try {
    const { unitId, productId, mainParentProductName } = req.body;

    if (!unitId) {
      return res
        .status(400)
        .json({ message: "unitId is required to fetch stock quantities." });
    }

    const unitObjectId = new mongoose.Types.ObjectId(unitId);

    // Build match stage
    const matchstage = { isActive: true };
    if (mainParentProductName) {
      matchstage.mainParentProductName = {
        $regex: mainParentProductName,
        $options: "i"
      };
    }
    if (productId) {
      matchstage._id = { $ne: new mongoose.Types.ObjectId(productId) };
    }
    const mainParentProducts = await MainParentProduct.aggregate([
      { $match: matchstage },

      // Unwind parentProducts array
      { $unwind: { path: "$parentProducts", preserveNullAndEmptyArrays: true } },

      // Lookup parentProduct details
      {
        $lookup: {
          from: "parentproducts",
          localField: "parentProducts.parentProductId",
          foreignField: "_id",
          as: "parentProductDetails"
        }
      },

      // Unwind parentProductDetails
      {
        $unwind: { path: "$parentProductDetails", preserveNullAndEmptyArrays: true }
      },

      // Filter stock for the requested unit
      {
        $addFields: {
          parentStockByUnit: {
            $filter: {
              input: "$parentProductDetails.stockByUnit",
              as: "s",
              cond: { $eq: ["$$s.unitId", unitObjectId] }
            }
          }
        }
      },

      {
        $addFields: {
          parentStock: { $arrayElemAt: ["$parentStockByUnit", 0] }
        }
      },

      // Project flat parentProducts object
      {
        $addFields: {
          parentProducts: {
            parentProductId: "$parentProducts.parentProductId",
            quantityConfiguredInMainParent: "$parentProducts.quantity",
            parentProductName: "$parentProductDetails.parentProductName",
            totalPPQuantity: { $ifNull: ["$parentStock.totalPPQuantity", 0] },
            availableToCommitPPQuantity: { $ifNull: ["$parentStock.availableToCommitPPQuantity", 0] }
          }
        }
      },

      // Group back by MainParentProduct
      {
        $group: {
          _id: "$_id",
          mainParentProductCode: { $first: "$mainParentProductCode" },
          mainParentProductName: { $first: "$mainParentProductName" },
          totalMPQuantity: { $first: "$totalMPQuantity" },
          availableToCommitMPQuantity: { $first: "$availableToCommitMPQuantity" },
          description: { $first: "$description" },
          isActive: { $first: "$isActive" },
          createdAt: { $first: "$createdAt" },
          updatedAt: { $first: "$updatedAt" },
          parentProducts: { $push: "$parentProducts" }
        }
      },

      // Final project
      {
        $project: {
          _id: 0,
          MainParentProductIDPK: "$_id",
          mainParentProductCode: 1,
          mainParentProductName: 1,
          totalMPQuantity: 1,
          availableToCommitMPQuantity: 1,
          description: 1,
          isActive: 1,
          createdAt: 1,
          updatedAt: 1,
          parentProducts: 1
        }
      },

      { $sort: { createdAt: -1 } },
      { $limit: 50 }
    ]);

    res.status(200).json(mainParentProducts);
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message:
        error.message || "Server error while fetching main parent products."
    });
  }
};


