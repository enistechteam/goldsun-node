const ChildProduct = require('../../models/masterModels/ChildProduct')
const ParentProduct = require('../../models/masterModels/ParentProduct')
const MainParent = require('../../models/masterModels/MainParent')
const logCountChange = require('../mainControllers/ActivityLogControllers')
const Unit = require("../../models/masterModels/Unit")
const { default: mongoose } = require('mongoose')

exports.addStockToChildProduct = async (req, res) => {
  try {
    const { productid, quantity, unitId } = req.body;

    const product = await ChildProduct.findById(productid);
    if (!product) {
      return res.status(404).json({ message: 'Child product not found' });
    }

    let stockEntry = product.stockByUnit.find(
      (s) => s.unitId.toString() === unitId
    );

    if (!stockEntry) {
      // ✅ Push new entry directly with the desired counts
      product.stockByUnit.push({
        unitId,
        totalCPQuantity: quantity,
        committedCPQuantity: 0,
        availableToCommitCPQuantity: quantity
      });
    } else {
      stockEntry.totalCPQuantity += quantity;
      stockEntry.availableToCommitCPQuantity += quantity;
    }

    await product.save();

    // Return the updated stock entry
    const updatedEntry = product.stockByUnit.find(
      (s) => s.unitId.toString() === unitId
    );

    res.status(200).json({
      message: 'Stock added to child product',
      data: {
        productid: product._id,
        unitId: updatedEntry.unitId,
        totalCPQuantity: updatedEntry.totalCPQuantity,
        committedCPQuantity: updatedEntry.committedCPQuantity,
        availableToCommitCPQuantity: updatedEntry.availableToCommitCPQuantity
      }
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.addStockToParentProduct = async (req, res) => {
  try {
    const { productid, quantity, unitId } = req.body;

    // 🟠 Find the ParentProduct
    const unitDet= await Unit.findById({_id:new mongoose.Types.ObjectId(unitId)})
    const parent = await ParentProduct.findById(productid);
    if (!parent) {
      return res.status(404).json({ message: 'Parent product not found' });
    }

    // ✅ Find previous total quantity for logging
    let stockEntry = parent.stockByUnit.find(
      (s) => s.unitId.toString() === unitId
    );

    const oldTotal = stockEntry?.totalPPQuantity || 0;

    // ✅ Update or create the stock entry for this unit
    if (!stockEntry) {
      parent.stockByUnit.push({
        unitId,
        totalPPQuantity: quantity,
        committedPPQuantity: 0,
        availableToCommitPPQuantity: quantity
      });
    } else {
      stockEntry.totalPPQuantity += quantity;
      stockEntry.availableToCommitPPQuantity += quantity;
    }

    await parent.save();

    // ✅ Find MainParents that reference this ParentProduct
    const mainParents = await MainParent.find({
      "parentProducts.parentProductId": productid
    });

    for (const mp of mainParents) {
      const requiredParents = mp.parentProducts;

      let minPossibleUnits = Infinity;

      for (const config of requiredParents) {
        const ppId = config.parentProductId;
        const qtyNeeded = config.quantity;

        const pp = await ParentProduct.findById(ppId);
        if (!pp) {
          minPossibleUnits = 0;
          break;
        }

        const stockByUnit = pp.stockByUnit.find(s =>
          s.unitId?.toString() === unitId
        );

        const available = stockByUnit?.availableToCommitPPQuantity || 0;

        if (qtyNeeded <= 0) {
          minPossibleUnits = 0;
          break;
        }

        const possibleUnits = Math.floor(available / qtyNeeded);

        minPossibleUnits = Math.min(minPossibleUnits, possibleUnits);
      }

      if (minPossibleUnits > 0 && minPossibleUnits !== Infinity) {
        // Find existing MP stock or create it
        let mpStock = mp.stockByUnit?.find(
          s => s.unitId?.toString() === unitId
        );

        if (!mpStock) {
          if (!mp.stockByUnit) mp.stockByUnit = [];
          mp.stockByUnit.push({
            unitId,
            totalMPQuantity: minPossibleUnits,
            availableToCommitMPQuantity: minPossibleUnits
          });
        } else {
          mpStock.totalMPQuantity = minPossibleUnits;
          mpStock.availableToCommitMPQuantity = minPossibleUnits;
        }

        await mp.save();
      }
    }

    const updatedEntry = parent.stockByUnit.find(
      (s) => s.unitId.toString() === unitId
    );

    // ✅ Log the stock addition
    await logCountChange.logCountChange({
      req,
      entityName: parent.parentProductName,
      entityCode: parent.parentProductCode,
      module: "ParentProduct",
      changeField: "totalPPQuantity",
      oldValue: oldTotal,
      newValue: updatedEntry.totalPPQuantity,
      activityValue:quantity,
      description: `Added ${quantity} Quantities of ${parent.parentProductName} in ${unitDet.UnitName}, Old Stock - ${oldTotal} , Current Stock - ${updatedEntry.totalPPQuantity} `,
      parentProductId: parent._id,
      unitId: unitId
    });

    res.status(200).json({
      message: "Stock added to parent product and MainParents recalculated.",
      data: {
        productid: parent._id,
        unitId: updatedEntry.unitId,
        totalPPQuantity: updatedEntry.totalPPQuantity,
        committedPPQuantity: updatedEntry.committedPPQuantity,
        availableToCommitPPQuantity: updatedEntry.availableToCommitPPQuantity
      }
    });
  } catch (err) {
    console.error("🔥 ERROR:", err);
    res.status(500).json({ message: err.message || "Internal server error." });
  }
};

exports.bulkAddStockToParentProducts = async (req, res) => {
  try {
    const { stocks } = req.body; // [{ parentProductName, quantity, unitId }]

    if (!Array.isArray(stocks) || stocks.length === 0) {
      return res.status(400).json({ message: 'Stocks array is required and must not be empty' });
    }

    const results = [];

    for (const stock of stocks) {
      const { parentProductName, quantity, unitId } = stock;

      const product = await ParentProduct.findOne({ parentProductName });

      if (!product) {
        results.push({
          parentProductName,
          status: 'failed',
          reason: 'Parent product not found'
        });
        continue;
      }

      let stockEntry = product.stockByUnit.find(
        (s) => s.unitId.toString() === unitId
      );

      if (!stockEntry) {
        product.stockByUnit.push({
          unitId,
          totalPPQuantity: quantity,
          committedPPQuantity: 0,
          availableToCommitPPQuantity: quantity
        });
      } else {
        stockEntry.totalPPQuantity += quantity;
        stockEntry.availableToCommitPPQuantity += quantity;
      }

      await product.save();

      const updatedEntry = product.stockByUnit.find(
        (s) => s.unitId.toString() === unitId
      );

      results.push({
        parentProductName,
        status: 'success',
        data: {
          productid: product._id,
          unitId: updatedEntry.unitId,
          totalPPQuantity: updatedEntry.totalPPQuantity,
          committedPPQuantity: updatedEntry.committedPPQuantity,
          availableToCommitPPQuantity: updatedEntry.availableToCommitPPQuantity
        }
      });
    }

    res.status(200).json({
      message: 'Bulk stock update for ParentProduct completed',
      results
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.recalculateMainParentStocks = async (req, res) => {
  const session = await mongoose.startSession();
  
  try {
    session.startTransaction();
    
    const { unitId, skip = 0, limit = 500 } = req.body;

    if (!unitId) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: "unitId is required"
      });
    }

    // Convert unitId to string for consistent comparison
    const unitIdStr = unitId.toString();

    // Fetch main parents with session
    const mainParents = await MainParent.find()
      .skip(Number(skip))
      .limit(Number(limit))
      .session(session);

    if (!mainParents || mainParents.length === 0) {
      await session.commitTransaction();
      return res.status(200).json({
        success: true,
        message: `No main parents found for batch skip=${skip}, limit=${limit}`
      });
    }

    // Collect all unique parent product IDs
    const parentProductIds = new Set();
    mainParents.forEach(mp => {
      if (mp.parentProducts && Array.isArray(mp.parentProducts)) {
        mp.parentProducts.forEach(config => {
          if (config.parentProductId) {
            parentProductIds.add(config.parentProductId.toString());
          }
        });
      }
    });

    // Fetch all parent products in ONE query
    const parentProducts = await ParentProduct.find({
      _id: { $in: Array.from(parentProductIds) }
    }).session(session);

    // Create a Map for O(1) lookup
    const ppMap = new Map();
    parentProducts.forEach(pp => {
      ppMap.set(pp._id.toString(), pp);
    });

    let processedCount = 0;
    let updatedCount = 0;

    // Process each main parent
    for (const mp of mainParents) {
      const requiredParents = mp.parentProducts || [];
      
      // Skip if no parent products configured
      if (requiredParents.length === 0) {
        // console.log(`⚠️  MainParent ${mp._id} has no parent products configured`);
        continue;
      }

      let minPossibleUnits = Infinity;
      let hasError = false;
      const calculations = []; // For debugging

      // Calculate minimum possible units based on parent products
      for (const config of requiredParents) {
        const ppId = config.parentProductId?.toString();
        
        // Validate parent product ID exists
        if (!ppId) {
          console.warn(`⚠️  MainParent ${mp._id}: Missing parentProductId in config`);
          minPossibleUnits = 0;
          hasError = true;
          break;
        }

        // Validate quantity is a positive number
        const requiredQty = Number(config.quantity);
        if (!requiredQty || requiredQty <= 0 || isNaN(requiredQty)) {
          console.warn(`⚠️  MainParent ${mp._id}: Invalid quantity for PP ${ppId}: ${config.quantity}`);
          minPossibleUnits = 0;
          hasError = true;
          break;
        }

        // Get parent product from map
        const pp = ppMap.get(ppId);
        
        if (!pp) {
          console.warn(`⚠️  MainParent ${mp._id}: Parent Product ${ppId} not found in database`);
          minPossibleUnits = 0;
          hasError = true;
          break;
        }

        // Find stock for this specific unit
        const stockByUnit = pp.stockByUnit?.find(
          (s) => s.unitId?.toString() === unitIdStr
        );

        const availableQty = Number(stockByUnit?.availableToCommitPPQuantity) || 0;

        // Calculate how many complete units can be made with this parent product
        const possibleUnits = Math.floor(availableQty / requiredQty);
        
        // Store calculation for debugging
        calculations.push({
          ppId: ppId,
          ppName: pp.name || 'N/A',
          requiredQty: requiredQty,
          availableQty: availableQty,
          possibleUnits: possibleUnits
        });

        // Update minimum
        minPossibleUnits = Math.min(minPossibleUnits, possibleUnits);
      }

      // Log calculation details for debugging
      // console.log(`\n📊 MainParent ${mp._id} (${mp.name || 'N/A'}):`);
      // console.log('Calculations:', JSON.stringify(calculations, null, 2));
      // console.log(`Final minPossibleUnits: ${minPossibleUnits}`);

      // Handle edge cases
      if (minPossibleUnits === Infinity) {
        console.warn(`⚠️  MainParent ${mp._id}: No valid calculations (Infinity)`);
        minPossibleUnits = 0;
      }
      
      if (minPossibleUnits < 0) {
        console.warn(`⚠️  MainParent ${mp._id}: Negative result, setting to 0`);
        minPossibleUnits = 0;
      }

      // Initialize stockByUnit array if it doesn't exist
      if (!mp.stockByUnit || !Array.isArray(mp.stockByUnit)) {
        mp.stockByUnit = [];
      }

      // Find existing stock entry for this unit
      const stockIndex = mp.stockByUnit.findIndex(
        (s) => s.unitId?.toString() === unitIdStr
      );

      if (stockIndex === -1) {
        // Create new stock entry
        // console.log(`✅ Creating new stock entry for unit ${unitIdStr}`);
        mp.stockByUnit.push({
          unitId:new mongoose.Types.ObjectId(unitIdStr),
          totalMPQuantity: minPossibleUnits,
          committedMPQuantity: 0,
          availableToCommitMPQuantity: minPossibleUnits
        });
        updatedCount++;
      } else {
        // Update existing stock entry
        const existingCommitted = Number(mp.stockByUnit[stockIndex].committedMPQuantity) || 0;
        const oldTotal = mp.stockByUnit[stockIndex].totalMPQuantity;
        
        mp.stockByUnit[stockIndex].totalMPQuantity = minPossibleUnits;
        mp.stockByUnit[stockIndex].availableToCommitMPQuantity = 
          Math.max(0, minPossibleUnits - existingCommitted);
        
        // console.log(`✅ Updated stock: ${oldTotal} → ${minPossibleUnits} (committed: ${existingCommitted})`);
        updatedCount++;
      }

      // Mark as modified for Mongoose to detect changes in nested arrays
      mp.markModified('stockByUnit');
      
      // Save with session
      await mp.save({ session });
      processedCount++;
    }

    // Commit transaction
    await session.commitTransaction();

    // console.log(`\n✅ Transaction committed successfully`);
    // console.log(`Processed: ${processedCount}, Updated: ${updatedCount}`);

    return res.status(200).json({
      success: true,
      message: `MainParentProduct stocks recalculated for unit ${unitIdStr}`,
      details: {
        batch: { skip: Number(skip), limit: Number(limit) },
        processed: processedCount,
        updated: updatedCount
      }
    });

  } catch (error) {
    // Abort transaction on any error
    await session.abortTransaction();
    
    console.error("🔥 Error recalculating main parent stocks:", error);
    console.error("Stack trace:", error.stack);
    
    return res.status(500).json({
      success: false,
      message: "Error recalculating stocks",
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  } finally {
    // Always end the session
    session.endSession();
  }
};

// exports.addStockToMainParentProduct = async (req, res) => {
//   try {
//     const { productid, quantity, unitId } = req.body;
// const unitDet= await Unit.findById({_id:new mongoose.Types.ObjectId(unitId)})
//     const mainParent = await MainParent.findById(productid);
//     if (!mainParent) {
//       return res.status(404).json({ message: 'Main Parent Product not found' });
//     }

//     // ✅ Track old quantity for logs
//     let stockEntry = mainParent.stockByUnit.find(
//       (s) => s.unitId.toString() === unitId
//     );
//     const oldTotal = stockEntry?.totalMPQuantity || 0;

//     // ✅ Add or update stock
//     if (!stockEntry) {
//       mainParent.stockByUnit.push({
//         unitId,
//         totalMPQuantity: quantity,
//         committedMPQuantity: 0,
//         availableToCommitMPQuantity: quantity
//       });
//     } else {
//       stockEntry.totalMPQuantity += quantity;
//       stockEntry.availableToCommitMPQuantity += quantity;
//     }

//     mainParent.markModified("stockByUnit");
//     await mainParent.save();

//     // ✅ Add corresponding ParentProduct & ChildProduct stock
//     const affectedPPIds = [];

//     for (const pp of mainParent.parentProducts) {
//       const requiredPPQty = pp.quantity * quantity;
//       affectedPPIds.push(pp.parentProductId.toString());

//       const parent = await ParentProduct.findById(pp.parentProductId);
//       if (!parent) continue;

//       let ppStock = parent.stockByUnit.find(
//         (s) => s.unitId.toString() === unitId
//       );

//       if (!ppStock) {
//         parent.stockByUnit.push({
//           unitId,
//           totalPPQuantity: requiredPPQty,
//           committedPPQuantity: 0,
//           availableToCommitPPQuantity: requiredPPQty
//         });
//       } else {
//         ppStock.totalPPQuantity += requiredPPQty;
//         ppStock.availableToCommitPPQuantity += requiredPPQty;
//       }

//       parent.markModified("stockByUnit");
//       await parent.save();

//       // ✅ Cascade to Child Products
//       for (const cp of parent.childProducts) {
//         const requiredChildQty = requiredPPQty * cp.quantity;

//         const child = await ChildProduct.findById(cp.childProductId);
//         if (!child) continue;

//         let childStock = child.stockByUnit.find(
//           (s) => s.unitId.toString() === unitId
//         );

//         if (!childStock) {
//           child.stockByUnit.push({
//             unitId,
//             totalCPQuantity: requiredChildQty,
//             committedCPQuantity: 0,
//             availableToCommitCPQuantity: requiredChildQty
//           });
//         } else {
//           childStock.totalCPQuantity += requiredChildQty;
//           childStock.availableToCommitCPQuantity += requiredChildQty;
//         }

//         child.markModified("stockByUnit");
//         await child.save();
//       }
//     }

//     // ✅ Recalculate other MainParents that use these ParentProducts
//     const otherMainParents = await MainParent.find({
//       _id: { $ne: mainParent._id },
//       'parentProducts.parentProductId': { $in: affectedPPIds }
//     });

//     for (const mp of otherMainParents) {
//       let minPossibleUnits = Infinity;

//       for (const config of mp.parentProducts) {
//         const pp = await ParentProduct.findById(config.parentProductId);
//         const ppStock = pp?.stockByUnit.find(
//           s => s.unitId.toString() === unitId
//         );
//         const available = ppStock?.totalPPQuantity || 0;
//         const possibleUnits = Math.floor(available / config.quantity);
//         minPossibleUnits = Math.min(minPossibleUnits, possibleUnits);
//       }

//       if (minPossibleUnits > 0 && minPossibleUnits !== Infinity) {
//         let mpStock = mp.stockByUnit.find(
//           s => s.unitId.toString() === unitId
//         );

//         if (!mpStock) {
//           mp.stockByUnit.push({
//             unitId,
//             totalMPQuantity: minPossibleUnits,
//             committedMPQuantity: 0,
//             availableToCommitMPQuantity: minPossibleUnits
//           });
//         } else {
//           mpStock.totalMPQuantity = minPossibleUnits;
//           mpStock.availableToCommitMPQuantity = minPossibleUnits;
//         }

//         mp.markModified("stockByUnit");
//         await mp.save();
//       }
//     }

//     // ✅ Log the addition
//     const updatedEntry = mainParent.stockByUnit.find(
//       (s) => s.unitId.toString() === unitId
//     );

//     await logCountChange.logCountChange({
//       req,
//       entityName: mainParent.mainParentProductName,
//       entityCode: mainParent.mainParentProductCode,
//       module: "MainParentProduct",
//       changeField: "totalMPQuantity",
//       oldValue: oldTotal,
//       newValue: updatedEntry.totalMPQuantity,
//       activityValue: quantity,
//       description: `Added ${quantity} Quantities of ${mainParent.mainParentProductName} in ${unitDet.UnitName}, Old Stock - ${oldTotal}, Current Stock - ${updatedEntry.totalMPQuantity}`,
//       mainParentId: mainParent._id,
//       unitId: unitId
//     });

//     res.status(200).json({
//       message: 'Stock added to Main Parent Product and dependent MainParents recalculated.',
//       data: mainParent
//     });
//   } catch (err) {
//     console.error("🔥 ERROR:", err);
//     res.status(500).json({ message: err.message });
//   }
// };

exports.addStockToMainParentProduct = async (req, res) => {
  try {
    const { productid, quantity, unitId } = req.body;
    
    const unitObjectId = new mongoose.Types.ObjectId(unitId);

    const unitDet = await Unit.findById(unitObjectId);
    const mainParent = await MainParent.findById(productid);

    if (!mainParent) {
      return res.status(404).json({ message: 'Main Parent Product not found' });
    }

    const stockEntry = mainParent.stockByUnit.find(
      (s) => s.unitId.toString() === unitId
    );
    const oldTotal = stockEntry?.totalMPQuantity || 0;

    // Perform Atomic Update on Main Parent
    const mpUpdateResult = await MainParent.updateOne(
      { _id: mainParent._id, "stockByUnit.unitId": unitObjectId },
      {
        $inc: {
          "stockByUnit.$.totalMPQuantity": quantity,
          "stockByUnit.$.availableToCommitMPQuantity": quantity
        }
      }
    );

    // If unit didn't exist, push it
    if (mpUpdateResult.modifiedCount === 0) {
      await MainParent.updateOne(
        { _id: mainParent._id },
        {
          $push: {
            stockByUnit: {
              unitId: unitObjectId,
              totalMPQuantity: quantity,
              committedMPQuantity: 0,
              availableToCommitMPQuantity: quantity
            }
          }
        }
      );
    }

    // Refresh MainParent to get updated data for logs/logic
    const updatedMainParent = await MainParent.findById(productid);

    // ✅ 2. Update Parent Products & Child Products Atomically
    const affectedPPIds = [];

    for (const pp of updatedMainParent.parentProducts) {
      const requiredPPQty = pp.quantity * quantity;
      affectedPPIds.push(pp.parentProductId.toString());

      // We still need to find the parent to get its child configuration
      const parentDoc = await ParentProduct.findById(pp.parentProductId);
      if (!parentDoc) continue;

      // -- ATOMIC UPDATE FOR PARENT PRODUCT --
      const ppUpdate = await ParentProduct.updateOne(
        { _id: pp.parentProductId, "stockByUnit.unitId": unitObjectId },
        {
          $inc: {
            "stockByUnit.$.totalPPQuantity": requiredPPQty,
            "stockByUnit.$.availableToCommitPPQuantity": requiredPPQty
          }
        }
      );

      // If unit doesn't exist in Parent, push it
      if (ppUpdate.modifiedCount === 0) {
        await ParentProduct.updateOne(
          { _id: pp.parentProductId },
          {
            $push: {
              stockByUnit: {
                unitId: unitObjectId,
                totalPPQuantity: requiredPPQty,
                committedPPQuantity: 0,
                availableToCommitPPQuantity: requiredPPQty
              }
            }
          }
        );
      }

      // -- ATOMIC UPDATE FOR CHILD PRODUCTS --
      for (const cp of parentDoc.childProducts) {
        const requiredChildQty = requiredPPQty * cp.quantity;

        const cpUpdate = await ChildProduct.updateOne(
          { _id: cp.childProductId, "stockByUnit.unitId": unitObjectId },
          {
            $inc: {
              "stockByUnit.$.totalCPQuantity": requiredChildQty,
              "stockByUnit.$.availableToCommitCPQuantity": requiredChildQty
            }
          }
        );

        if (cpUpdate.modifiedCount === 0) {
          await ChildProduct.updateOne(
            { _id: cp.childProductId },
            {
              $push: {
                stockByUnit: {
                  unitId: unitObjectId,
                  totalCPQuantity: requiredChildQty,
                  committedCPQuantity: 0,
                  availableToCommitCPQuantity: requiredChildQty
                }
              }
            }
          );
        }
      }
    }

    // ✅ 3. Recalculate other MainParents
    // (This logic remains largely checking 'available' stock, so it's fine as is, 
    // but ensures we read the freshest data from DB)
    const otherMainParents = await MainParent.find({
      _id: { $ne: mainParent._id },
      'parentProducts.parentProductId': { $in: affectedPPIds }
    });

    for (const mp of otherMainParents) {
      let minPossibleUnits = Infinity;

      // Check all parent products required by this MainParent
      for (const config of mp.parentProducts) {
        const pp = await ParentProduct.findById(config.parentProductId);
        const ppStock = pp?.stockByUnit.find(
          s => s.unitId.toString() === unitId
        );
        const available = ppStock?.totalPPQuantity || 0; // Or availableToCommitPPQuantity based on your logic
        const possibleUnits = Math.floor(available / config.quantity);
        minPossibleUnits = Math.min(minPossibleUnits, possibleUnits);
      }

      // Update the calculated stock
      if (minPossibleUnits !== Infinity) {
        // We use atomic set here to ensure we don't accidentally push duplicate units
        // or overwrite with stale data if possible.
        const mpStockUpdate = await MainParent.updateOne(
          { _id: mp._id, "stockByUnit.unitId": unitObjectId },
          {
            $set: {
              "stockByUnit.$.totalMPQuantity": minPossibleUnits,
              "stockByUnit.$.availableToCommitMPQuantity": minPossibleUnits
            }
          }
        );

        if (mpStockUpdate.modifiedCount === 0 && minPossibleUnits > 0) {
           await MainParent.updateOne(
            { _id: mp._id },
            {
              $push: {
                stockByUnit: {
                  unitId: unitObjectId,
                  totalMPQuantity: minPossibleUnits,
                  committedMPQuantity: 0,
                  availableToCommitMPQuantity: minPossibleUnits
                }
              }
            }
          );
        }
      }
    }

    // ✅ 4. Log the addition
    // We use the 'updatedMainParent' fetched earlier to get the correct new values
    const newStockEntry = updatedMainParent.stockByUnit.find(
      (s) => s.unitId.toString() === unitId
    );

    await logCountChange.logCountChange({
      req,
      entityName: updatedMainParent.mainParentProductName,
      entityCode: updatedMainParent.mainParentProductCode,
      module: "MainParentProduct",
      changeField: "totalMPQuantity",
      oldValue: oldTotal,
      newValue: newStockEntry ? newStockEntry.totalMPQuantity : quantity,
      activityValue: quantity,
      description: `Added ${quantity} Quantities of ${updatedMainParent.mainParentProductName} in ${unitDet?.UnitName || 'Unit'}, Old Stock - ${oldTotal}, Current Stock - ${newStockEntry ? newStockEntry.totalMPQuantity : quantity}`,
      mainParentId: updatedMainParent._id,
      unitId: unitId
    });

    res.status(200).json({
      message: 'Stock added to Main Parent Product and dependent MainParents recalculated.',
      data: updatedMainParent
    });

  } catch (err) {
    console.error("🔥 ERROR:", err);
    res.status(500).json({ message: err.message });
  }
};

exports.adjustStock = async (req, res) => {
  try {
    const {
      unitId,
      productid,
      quantity,
      productType,
      Reason,
      Description,
      user
    } = req.body;

    if (!unitId || !productid || !quantity || !productType) {
      return res.status(400).json({
        message: "unitId, productid, quantity, and productType are required."
      });
    }

    if (quantity <= 0) {
      return res.status(400).json({
        message: "Quantity must be a positive number."
      });
    }

    let model;
    let totalField, availableField;
    let productDoc;
    let entityName;
    let entityCode;

    switch (productType) {
      case "Child Product":
        model = ChildProduct;
        totalField = "stockByUnit.$.totalCPQuantity";
        availableField = "stockByUnit.$.availableToCommitCPQuantity";
        break;

      case "Parent Product":
        model = ParentProduct;
        totalField = "stockByUnit.$.totalPPQuantity";
        availableField = "stockByUnit.$.availableToCommitPPQuantity";
        break;

      case "Main Parent":
        model = MainParent;
        totalField = "stockByUnit.$.totalMPQuantity";
        availableField = "stockByUnit.$.availableToCommitMPQuantity";
        break;

      default:
        return res.status(400).json({
          message: `Invalid productType: ${productType}`
        });
    }

    productDoc = await model.findById(productid);
    if (!productDoc) {
      return res.status(404).json({
        message: `No ${productType} found for id ${productid}`
      });
    }

    const stock = productDoc.stockByUnit.find(
      (s) => s.unitId?.toString() === unitId
    );
console.log(stock,"stock")
    if (!stock) {
      return res.status(404).json({
        message: `No stock found for ${unitDet.UnitName} in ${productType}`
      });
    }

    // Check if enough stock is available to reduce
    const currentQty = stock.availableToCommitCPQuantity ?? stock.availableToCommitPPQuantity ?? stock.availableToCommitMPQuantity ?? 0;
    if (currentQty < quantity) {
      return res.status(400).json({
        message: `Cannot reduce stock below zero. Available total: ${currentQty}`
      });
    }

    // Reduce the stock
    const update = {
      $inc: {
        [totalField]: -quantity,
        [availableField]: -quantity
      }
    };

    await model.updateOne(
      {
        _id: productid,
        "stockByUnit.unitId": unitId
      },
      update
    );

    // Entity name for logs
    if (productType === "Child Product") {
      entityName = productDoc.childProductName || "";
      entityCode = productDoc.childProductCode || ""
    } else if (productType === "Parent Product") {
      entityName = productDoc.parentProductName || "";
      entityCode = productDoc.parentProductCode || ""
    } else if (productType === "Main Parent") {
      entityName = productDoc.mainParentProductName || "";
      entityCode = productDoc.mainParentProductCode || ""
    }

    if (productType === "Parent Product") {
      await recalculateMainParentsForParent(productid, unitId);
    }

    if (productType === "Main Parent") {
      const mainParent = await MainParent.findById(productid);
      if (mainParent && mainParent.parentProducts?.length > 0) {
        for (const config of mainParent.parentProducts) {
          const ppId = config.parentProductId;
          const requiredQty = config.quantity;
          const reduceBy = requiredQty * quantity;

          if (reduceBy > 0) {
            await ParentProduct.updateOne(
              {
                _id: ppId,
                "stockByUnit.unitId": unitId
              },
              {
                $inc: {
                  "stockByUnit.$.totalPPQuantity": -reduceBy,
                  "stockByUnit.$.availableToCommitPPQuantity": -reduceBy
                }
              }
            );

            // Recalculate MPs impacted by this parent product
            await recalculateMainParentsForParent(ppId, unitId);
          }
        }
      }
    }

    // Log activity
    await logCountChange.logCreate({
      employeeId: user?.employeeId || null,
      employeeCode: user?.employeeCode || null,
      employeeName: user?.employeeName || null,
      departmentId: user?.departmentId || null,
      departmentName: null,
      role: user?.role || null,
      unitId: unitId,
      unitName: user?.unitName || null,

      childProductId: productType === "Child Product" ? productid : null,
      parentProductId: productType === "Parent Product" ? productid : null,
      mainParentId: productType === "Main Parent" ? productid : null,

      action: "stock_adjustment",
      module: "Stock",
      entityName: entityName,
      entityCode: entityCode || "",
      changeField: "totalQuantity",
      oldValue: currentQty,
      activityValue: -quantity,
      newValue: currentQty - quantity,
      description: `Stock adjusted from ${currentQty} by -${quantity} and the new quantity is ${currentQty - quantity}. Reason: ${Reason}. Details: ${Description}`,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"]
    });

    return res.status(200).json({
      message: `Stock adjusted successfully for ${productType}.`,
      adjustedProductId: productid,
      adjustedQuantity: quantity
    });

  } catch (error) {
    console.error(error);
    return res.status(500).json({
      message: error.message || "Error adjusting stock."
    });
  }
};

async function recalculateMainParentsForParent(parentProductId, unitId) {
  const mainParents = await MainParent.find({
    "parentProducts.parentProductId": parentProductId
  });

  const allPPs = await ParentProduct.find();
  const ppMap = new Map();
  allPPs.forEach(pp => ppMap.set(pp._id.toString(), pp));

  for (const mp of mainParents) {
    let minPossibleMPs = Infinity;

    for (const config of mp.parentProducts) {
      const ppId = config.parentProductId;
      const qtyNeeded = config.quantity;

      const pp = ppMap.get(ppId.toString());
      if (!pp) {
        minPossibleMPs = 0;
        break;
      }

      const stockByUnit = pp.stockByUnit.find(
        (s) => s.unitId?.toString() === unitId
      );

      const available = stockByUnit?.availableToCommitPPQuantity || 0;
      const possibleUnits = qtyNeeded > 0 ? Math.floor(available / qtyNeeded) : 0;
      minPossibleMPs = Math.min(minPossibleMPs, possibleUnits);
    }

    if (minPossibleMPs === Infinity) minPossibleMPs = 0;

    const mpStock = mp.stockByUnit.find(
      (s) => s.unitId?.toString() === unitId
    );

    if (mpStock) {
      mpStock.totalMPQuantity = minPossibleMPs;
      mpStock.availableToCommitMPQuantity = minPossibleMPs;
    } else {
      mp.stockByUnit.push({
        unitId,
        totalMPQuantity: minPossibleMPs,
        availableToCommitMPQuantity: minPossibleMPs
      });
    }

    await mp.save();
  }
}


