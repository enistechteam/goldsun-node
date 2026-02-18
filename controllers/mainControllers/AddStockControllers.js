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
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { productid, quantity, unitId } = req.body;
    const unitObjectId = new mongoose.Types.ObjectId(unitId);

    // 1. ATOMIC UPDATE (Find and Update in one go)
    const parent = await ParentProduct.findOneAndUpdate(
      { _id: productid, "stockByUnit.unitId": unitObjectId },
      { $inc: { "stockByUnit.$.totalPPQuantity": quantity, "stockByUnit.$.availableToCommitPPQuantity": quantity } },
      { session, new: false } // Get state BEFORE update for accurate logging
    );

    let oldTotal = 0;
    if (!parent) {
      // Unit doesn't exist, push new unit entry safely
      const freshParent = await ParentProduct.findByIdAndUpdate(
        productid,
        { $push: { stockByUnit: { unitId: unitObjectId, totalPPQuantity: quantity, committedPPQuantity: 0, availableToCommitPPQuantity: quantity } } },
        { session, new: true }
      );
      if (!freshParent) throw new Error('Parent product not found');
    } else {
      oldTotal = parent.stockByUnit.find(s => s.unitId.toString() === unitId)?.totalPPQuantity || 0;
    }

    // 2. RECALCULATE (Pass session!)
    await recalculateMainParentsForParent(productid, unitId, session);

    // 3. LOGGING
    const unitDet = await Unit.findById(unitObjectId).session(session);
    await logCountChange.logCountChange({
      req,
      entityName: parent?.parentProductName || "Parent Product",
      oldValue: oldTotal,
      newValue: oldTotal + quantity,
      activityValue: quantity,
      description: `Added ${quantity} to ${unitDet?.UnitName}. Stock: ${oldTotal} -> ${oldTotal + quantity}`,
      parentProductId: productid,
      unitId: unitId
    });

    await session.commitTransaction();
    res.status(200).json({ message: "Stock added and recalculated." });
  } catch (err) {
    await session.abortTransaction();
    res.status(500).json({ message: err.message });
  } finally {
    session.endSession();
  }
};

exports.bulkAddStockToParentProducts = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { stocks } = req.body; // [{ parentProductName, quantity, unitId }]

    if (!Array.isArray(stocks) || stocks.length === 0) {
      throw new Error('Stocks array is required and must not be empty');
    }

    const parentNames = stocks.map(s => s.parentProductName);
    const products = await ParentProduct.find({ parentProductName: { $in: parentNames } }).session(session);
    const productMap = new Map(products.map(p => [p.parentProductName, p]));

    const bulkOps = [];
    const logsToCreate = [];
    const affectedProductIds = new Set();

    for (const stock of stocks) {
      const { parentProductName, quantity, unitId } = stock;
      const product = productMap.get(parentProductName);

      if (!product) continue;

      const unitObjectId = new mongoose.Types.ObjectId(unitId);
      const stockEntry = product.stockByUnit.find(s => s.unitId.toString() === unitId);
      const oldTotal = stockEntry ? stockEntry.totalPPQuantity : 0;

      // 1. Prepare Atomic Update
      // Try to update existing unit entry first
      bulkOps.push({
        updateOne: {
          filter: { _id: product._id, "stockByUnit.unitId": unitObjectId },
          update: { 
            $inc: { 
              "stockByUnit.$.totalPPQuantity": quantity, 
              "stockByUnit.$.availableToCommitPPQuantity": quantity 
            } 
          }
        }
      });

      // 2. Prepare Push for New Units
      // We use a second op that only runs if the unitId doesn't exist
      bulkOps.push({
        updateOne: {
          filter: { _id: product._id, "stockByUnit.unitId": { $ne: unitObjectId } },
          update: { 
            $push: { 
              stockByUnit: { 
                unitId: unitObjectId, totalPPQuantity: quantity, 
                committedPPQuantity: 0, availableToCommitPPQuantity: quantity 
              } 
            } 
          }
        }
      });

      affectedProductIds.add(product._id.toString());
      
      // 3. Prepare Log Data
      logsToCreate.push({
        entityName: parentProductName,
        module: "ParentProduct",
        oldValue: oldTotal,
        newValue: oldTotal + quantity,
        activityValue: quantity,
        parentProductId: product._id,
        unitId: unitId,
        description: `Bulk added ${quantity} units. Total: ${oldTotal + quantity}`
      });
    }

    // Execute all updates in one batch
    if (bulkOps.length > 0) {
      await ParentProduct.bulkWrite(bulkOps, { session });
      
      // 4. Trigger Recalculations for all unique impacted products
      for (const pId of affectedProductIds) {
        // Ensure your recalculate function uses the session!
        await recalculateMainParentsForParent(pId, stocks[0].unitId, session);
      }
      
      // 5. Batch Insert Logs
      if (logsToCreate.length > 0) {
        await logCountChange.insertMany(logsToCreate, { session });
      }
    }

    await session.commitTransaction();
    session.endSession();
    res.status(200).json({ message: 'Bulk stock update completed successfully' });

  } catch (err) {
    if (session.inTransaction()) await session.abortTransaction();
    session.endSession();
    res.status(500).json({ message: err.message });
  }
};

exports.recalculateMainParentStocks = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { unitId, skip = 0, limit = 500 } = req.body;
    const unitIdStr = unitId.toString();

    const mainParents = await MainParent.find().skip(Number(skip)).limit(Number(limit)).session(session).lean();
    if (!mainParents.length) {
        await session.commitTransaction();
        return res.status(200).json({ message: "Completed" });
    }

    // Collect parent product IDs to fetch stock in one query
    const ppIds = [...new Set(mainParents.flatMap(mp => mp.parentProducts?.map(p => p.parentProductId) || []))];
    const pps = await ParentProduct.find({ _id: { $in: ppIds } }).session(session).lean();
    const ppMap = new Map(pps.map(p => [p._id.toString(), p]));

    const bulkOps = [];

    for (const mp of mainParents) {
      let minPossible = Infinity;
      if (!mp.parentProducts?.length) continue;

      for (const config of mp.parentProducts) {
        const pp = ppMap.get(config.parentProductId?.toString());
        const stock = pp?.stockByUnit?.find(s => s.unitId.toString() === unitIdStr);
        const available = stock?.availableToCommitPPQuantity || 0;
        minPossible = Math.min(minPossible, Math.floor(available / (config.quantity || 1)));
      }
      
      const finalQty = minPossible === Infinity ? 0 : minPossible;

      // ATOMIC UPDATE: Only update the specific array element
      bulkOps.push({
        updateOne: {
          filter: { _id: mp._id, "stockByUnit.unitId": unitId },
          update: { 
            $set: { 
                "stockByUnit.$.totalMPQuantity": finalQty,
                "stockByUnit.$.availableToCommitMPQuantity": finalQty // Adjust this if you need to subtract committed
            } 
          }
        }
      });
    }

    if (bulkOps.length > 0) await MainParent.bulkWrite(bulkOps, { session });

    await session.commitTransaction();
    res.status(200).json({ success: true, processed: mainParents.length });
  } catch (error) {
    await session.abortTransaction();
    res.status(500).json({ message: error.message });
  } finally {
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
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { productid, quantity, unitId } = req.body;
    const unitObjectId = new mongoose.Types.ObjectId(unitId);

    // 1. ATOMIC UPDATE & FETCH (Main Parent)
    // We use findOneAndUpdate with new: false to get the EXACT state before the addition
    const mainParentBefore = await MainParent.findOneAndUpdate(
      { _id: productid, "stockByUnit.unitId": unitObjectId },
      { $inc: { "stockByUnit.$.totalMPQuantity": quantity, "stockByUnit.$.availableToCommitMPQuantity": quantity } },
      { session, new: false } 
    );

    let oldTotal = 0;

    if (!mainParentBefore) {
      // If the unit entry didn't exist, we push a new one.
      const freshMain = await MainParent.findByIdAndUpdate(
        productid,
        { 
          $push: { 
            stockByUnit: { 
              unitId: unitObjectId, totalMPQuantity: quantity, 
              committedMPQuantity: 0, availableToCommitMPQuantity: quantity 
            } 
          } 
        },
        { session, new: true }
      );
      if (!freshMain) throw new Error('Main Parent Product not found');
      oldTotal = 0; // It's a new unit entry
    } else {
      // Find the old total from the snapshot we just took
      const stockEntry = mainParentBefore.stockByUnit.find(s => s.unitId.toString() === unitId);
      oldTotal = stockEntry?.totalMPQuantity || 0;
    }

    // Refresh data for constituent loop (to get parentProducts mapping)
    const activeMainParent = await MainParent.findById(productid).session(session).lean();

    // 2. CONSTITUENT UPDATES (Parents & Children)
    for (const pp of activeMainParent.parentProducts) {
      const requiredPPQty = pp.quantity * quantity;

      // Atomic Update Parent Product
      const updatedPP = await ParentProduct.findOneAndUpdate(
        { _id: pp.parentProductId, "stockByUnit.unitId": unitObjectId },
        { $inc: { "stockByUnit.$.totalPPQuantity": requiredPPQty, "stockByUnit.$.availableToCommitPPQuantity": requiredPPQty } },
        { session, new: true }
      );

      if (!updatedPP) {
        // Handle missing unit entry in Parent Product
        await ParentProduct.updateOne(
          { _id: pp.parentProductId },
          { 
            $push: { 
              stockByUnit: { 
                unitId: unitObjectId, totalPPQuantity: requiredPPQty, 
                committedPPQuantity: 0, availableToCommitPPQuantity: requiredPPQty 
              } 
            } 
          },
          { session }
        );
      }

      // Re-fetch parent configuration for children
      const parentDoc = await ParentProduct.findById(pp.parentProductId).session(session).lean();
      
      // Atomic Update Child Products
      for (const cp of parentDoc.childProducts || []) {
        const requiredChildQty = requiredPPQty * cp.quantity;
        const cpUpdate = await ChildProduct.updateOne(
          { _id: cp.childProductId, "stockByUnit.unitId": unitObjectId },
          { $inc: { "stockByUnit.$.totalCPQuantity": requiredChildQty, "stockByUnit.$.availableToCommitCPQuantity": requiredChildQty } },
          { session }
        );

        if (cpUpdate.modifiedCount === 0) {
          await ChildProduct.updateOne(
            { _id: cp.childProductId },
            { 
              $push: { 
                stockByUnit: { 
                  unitId: unitObjectId, totalCPQuantity: requiredChildQty, 
                  committedCPQuantity: 0, availableToCommitCPQuantity: requiredChildQty 
                } 
              } 
            },
            { session }
          );
        }
      }

      // 3. RECALCULATE IMPACTED MAIN PARENTS (Using atomic recalculation logic)
      await recalculateMainParentsForParent(pp.parentProductId, unitId, session);
    }

    // 4. LOGGING (Preserving your exact logic)
    // newValue is calculated as oldTotal + added quantity
    const newTotal = oldTotal + quantity;

    await logCountChange.logCountChange({
      req,
      entityName: activeMainParent.mainParentProductName,
      entityCode: activeMainParent.mainParentProductCode,
      module: "MainParentProduct",
      changeField: "totalMPQuantity",
      oldValue: oldTotal,
      newValue: newTotal,
      activityValue: quantity,
      description: `Added ${quantity} Quantities of ${activeMainParent.mainParentProductName} in Unit, Old Stock - ${oldTotal}, Current Stock - ${newTotal}`,
      mainParentId: activeMainParent._id,
      unitId: unitId
    });

    await session.commitTransaction();
    res.status(200).json({ message: 'Stock added successfully.' });

  } catch (err) {
    if (session.inTransaction()) await session.abortTransaction();
    console.error("🔥 TRANSACTION ABORTED:", err);
    res.status(500).json({ message: err.message });
  } finally {
    session.endSession();
  }
};

exports.adjustStock = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { unitId, productid, quantity, productType, Reason, Description, user } = req.body;

    if (!unitId || !productid || !quantity || !productType) {
      throw new Error("Missing required fields.");
    }

    let model, totalField, availableField;
    switch (productType) {
      case "Child Product":
        model = ChildProduct;
        totalField = "totalCPQuantity";
        availableField = "availableToCommitCPQuantity";
        break;
      case "Parent Product":
        model = ParentProduct;
        totalField = "totalPPQuantity";
        availableField = "availableToCommitPPQuantity";
        break;
      case "Main Parent":
        model = MainParent; // Ensure this is the correct Model name
        totalField = "totalMPQuantity";
        availableField = "availableToCommitMPQuantity";
        break;
      default:
        throw new Error("Invalid product type.");
    }

    // 1. ATOMIC ADJUSTMENT (Primary Product)
    const updatedDoc = await model.findOneAndUpdate(
      { 
        _id: productid, 
        "stockByUnit.unitId": unitId, 
        [`stockByUnit.${availableField}`]: { $gte: Number(quantity) } 
      },
      { 
        $inc: { 
          [`stockByUnit.$.${totalField}`]: -Number(quantity), 
          [`stockByUnit.$.${availableField}`]: -Number(quantity) 
        } 
      },
      { session, new: false }
    );

    if (!updatedDoc) throw new Error("Insufficient stock for adjustment or unit record not found.");

    // 2. CONSTITUENT SYNC (If adjusting a Main Parent)
    // If we remove 10 Kits, we must remove 10 of each Parent Product inside it
    if (productType === "Main Parent" && updatedDoc.parentProducts?.length > 0) {
      for (const config of updatedDoc.parentProducts) {
        const requiredPPQty = Number(quantity) * config.quantity;
        
        const ppUpdate = await ParentProduct.updateOne(
          { 
            _id: config.parentProductId, 
            "stockByUnit.unitId": unitId,
            "stockByUnit.availableToCommitPPQuantity": { $gte: requiredPPQty }
          },
          { 
            $inc: { 
              "stockByUnit.$.totalPPQuantity": -requiredPPQty, 
              "stockByUnit.$.availableToCommitPPQuantity": -requiredPPQty 
            } 
          },
          { session }
        );

        if (ppUpdate.matchedCount === 0) {
          throw new Error(`Insufficient constituent stock for parent product: ${config.parentProductId}`);
        }

        // Trigger recalculation for this parent so other Main Parents are updated
        await recalculateMainParentsForParent(config.parentProductId, unitId, session);
      }
    }

    // 3. RECALCULATE (If a single Parent Product was adjusted)
    if (productType === "Parent Product") {
      await recalculateMainParentsForParent(productid, unitId, session);
    }

    // 4. LOGGING
    const stockObj = updatedDoc.stockByUnit.find(s => s.unitId.toString() === unitId.toString());
    const currentQty = Number(stockObj[availableField]) || 0;

    await logCountChange.logCreate({
      employeeId: user?.employeeId, employeeCode: user?.employeeCode, employeeName: user?.employeeName,
      unitId: unitId, unitName: user?.unitName,
      childProductId: productType === "Child Product" ? productid : null,
      parentProductId: productType === "Parent Product" ? productid : null,
      mainParentId: productType === "Main Parent" ? productid : null,
      action: "stock_adjustment", module: "Stock",
      entityName: updatedDoc.parentProductName || updatedDoc.mainParentProductName || updatedDoc.childProductName,
      entityCode: updatedDoc.parentProductCode || updatedDoc.mainParentProductCode || updatedDoc.childProductCode,
      changeField: "totalQuantity", oldValue: currentQty, activityValue: -Number(quantity), newValue: currentQty - Number(quantity),
      description: `Stock adjusted from ${currentQty} by -${quantity} and the new quantity is ${currentQty - quantity}. Reason: ${Reason}. Details: ${Description}`,
      ipAddress: req.ip, userAgent: req.headers["user-agent"]
    }, { session });

    await session.commitTransaction();
    res.status(200).json({ message: "Stock adjusted successfully." });
  } catch (error) {
    if (session.inTransaction()) await session.abortTransaction();
    res.status(500).json({ message: error.message });
  } finally {
    session.endSession();
  }
};

async function recalculateMainParentsForParent(parentProductId, unitId, session = null) {
  const mainParents = await MainParent.find({ "parentProducts.parentProductId": parentProductId }).session(session).lean();
  if (!mainParents.length) return;

  // Fetch ONLY the parent products required for these specific Main Parents
  const requiredPPIds = [...new Set(mainParents.flatMap(mp => mp.parentProducts.map(p => p.parentProductId)))];
  const pps = await ParentProduct.find({ _id: { $in: requiredPPIds } }).session(session).lean();
  const ppMap = new Map(pps.map(p => [p._id.toString(), p]));

  const bulkOps = mainParents.map(mp => {
    let minPossible = Infinity;
    for (const config of mp.parentProducts) {
      const pp = ppMap.get(config.parentProductId.toString());
      const stock = pp?.stockByUnit?.find(s => s.unitId.toString() === unitId.toString());
      const available = stock?.availableToCommitPPQuantity || 0;
      minPossible = Math.min(minPossible, Math.floor(available / (config.quantity || 1)));
    }

    return {
      updateOne: {
        filter: { _id: mp._id, "stockByUnit.unitId": unitId },
        update: { 
          $set: { 
            "stockByUnit.$.totalMPQuantity": minPossible === Infinity ? 0 : minPossible,
            "stockByUnit.$.availableToCommitMPQuantity": minPossible === Infinity ? 0 : minPossible 
          } 
        }
      }
    };
  });

  if (bulkOps.length > 0) await MainParent.bulkWrite(bulkOps, { session });
}


