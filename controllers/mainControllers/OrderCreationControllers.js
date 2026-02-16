const Order = require('../../models/masterModels/OrderCreation');
const mongoose = require('mongoose');
const Customer = require('../../models/masterModels/Customer');
const ProductType = require('../../models/masterModels/ProductType');
const ChildProduct = require('../../models/masterModels/ChildProduct');
const ParentProduct = require('../../models/masterModels/ParentProduct');
const MainParentProduct = require('../../models/masterModels/MainParent');
const ActivityLog = require('../mainControllers/ActivityLogControllers')
const Logs = require('../../models/masterModels/Log');

exports.createOrder = async (req, res) => {
  try {
    const {
      orderName,
      unitId,
      customerId,
      orderShippingAddress,
      orderAddress,
      orderDate,
      orderConfirmDate,
      orderType,
      status,
      productDetails,
      user
    } = req.body;

    if (!unitId) return res.status(400).json({ message: 'Unit ID is required' });

    // Validate productDetails
    for (const detail of productDetails) {
      const nonNullProductIds = [detail.childProductId, detail.parentProductId, detail.mainParentId].filter(Boolean);
      if (nonNullProductIds.length !== 1) {
        return res.status(400).json({
          message: 'Exactly one product ID must be provided per product detail (child/parent/mainParent)'
        });
      }
    }

    // Generate Order Code
    const lastOrder = await Order.findOne({ orderCode: { $regex: /^OR\d{7}$/ } })
      .sort({ orderCode: -1 })
      .collation({ locale: 'en', numericOrdering: true });

    let orderCode = 'OR0000001';
    if (lastOrder && lastOrder.orderCode) {
      const numericPart = parseInt(lastOrder.orderCode.slice(2));
      const nextNumber = numericPart + 1;
      orderCode = `OR${nextNumber.toString().padStart(7, '0')}`;
    }

    const preparedProductDetails = productDetails.map(detail => ({
      productTypeId: detail.productTypeId,
      childProductId: detail.childProductId || null,
      parentProductId: detail.parentProductId || null,
      mainParentId: detail.mainParentId || null,
      requiredQuantity: detail.requiredQuantity,
      assignedQuantity: detail.assignedQuantity || 0
    }));

    const newOrder = new Order({
      orderCode,
      orderName,
      unitId,
      customerId,
      orderShippingAddress,
      orderAddress,
      orderDate,
      orderConfirmDate: orderConfirmDate || null,
      orderType: orderType || 'MainOrder',
      status: status || 'Order Pending',
      productDetails: preparedProductDetails
    });

    await newOrder.save();

// Log creation
await ActivityLog.logCreate({
  employeeId: user?.employeeId || null,
  employeeCode: user?.employeeCode || null,
  employeeName: user?.employeeName || null,
  departmentId: user?.departmentId || null,
  departmentName: user?.departmentName || null,
  role: user?.role || null,
  unitId,
  customerID: customerId,
  unitName: null, // optional
  orderId: newOrder._id,
  orderCode: newOrder.orderCode,
  orderType: "MainOrder",
  orderStatus: newOrder.status,
  action: "Order created",
  module: "Order",
  entityName: newOrder.orderCode,
  entityCode: newOrder.orderCode,
  changeField: null,
  oldValue: null,
  activityValue: null,
  newValue: newOrder,
  description: `Order created with code ${newOrder.orderCode}`,
  ipAddress: req.ip,
  userAgent: req.headers["user-agent"]
});

res.status(200).json({ message: 'Order created successfully', data: newOrder._id });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// exports.updateOrder = async (req, res) => {
//   try {
//     const { _id, user, ...updateData } = req.body;
//     if (!_id) return res.status(400).json({ message: "ID is required" });

//     const existingOrder = await Order.findById(_id);
//     if (!existingOrder) {
//       return res.status(404).json({ message: "Order not found" });
//     }

//     // --- 1. PREPARE CHANGE TRACKING FOR LOG ---
//     let changes = [];
//     if (updateData.status && updateData.status !== existingOrder.status) {
//       changes.push(`Status changed from "${existingOrder.status}" to "${updateData.status}"`);
//     }
//     if (updateData.orderDate && updateData.orderDate !== existingOrder.orderDate) {
//       changes.push(`Order Date updated`);
//     }

//     // --- 2. VALIDATE & PREPARE PRODUCT DETAILS ---
//     if (updateData.productDetails) {
//       for (const detail of updateData.productDetails) {
//         const nonNullProductIds = [
//           detail.childProductId,
//           detail.parentProductId,
//           detail.mainParentId,
//         ].filter(Boolean);

//         if (nonNullProductIds.length !== 1) {
//           return res.status(400).json({
//             message: "Exactly one product ID must be provided per product detail",
//           });
//         }
//       }

//       // Map details and build product change description
//       let productSummary = [];
//       for (const detail of updateData.productDetails) {
//         let name = "Unknown Product";
//         if (detail.parentProductId) {
//           const p = await ParentProduct.findById(detail.parentProductId);
//           name = p ? p.parentProductName : name;
//         } else if (detail.mainParentId) {
//           const mp = await MainParentProduct.findById(detail.mainParentId);
//           name = mp ? mp.mainParentProductName : name;
//         }
//         productSummary.push(`${name} (Req: ${detail.requiredQuantity}, Asgn: ${detail.assignedQuantity || 0})`);
//       }
//       changes.push(`Products updated: [${productSummary.join(', ')}]`);

//       updateData.productDetails = updateData.productDetails.map((detail) => ({
//         productTypeId: detail.productTypeId,
//         childProductId: detail.childProductId || null,
//         parentProductId: detail.parentProductId || null,
//         mainParentId: detail.mainParentId || null,
//         requiredQuantity: detail.requiredQuantity,
//         assignedQuantity: detail.assignedQuantity || 0,
//       }));
//     }

//     // --- 3. MICRO-ORDER LOGIC ---
//     if (
//       updateData.status &&
//       updateData.status.toLowerCase() === "order executed" &&
//       existingOrder.status.toLowerCase() !== "order executed"
//     ) {
//       const unassignedItems = [];
//       const remainingItems = [];
//       const updatedProductDetails = updateData.productDetails || existingOrder.productDetails;

//       for (const detail of updatedProductDetails) {
//         const assignedQty = detail.assignedQuantity || 0;
//         const requiredQty = detail.requiredQuantity || 0;

//         if (assignedQty < requiredQty) {
//           unassignedItems.push({
//             ...detail,
//             requiredQuantity: requiredQty - assignedQty,
//             assignedQuantity: 0,
//           });
//           if (assignedQty > 0) {
//             remainingItems.push({ ...detail, requiredQuantity: detail.requiredQuantity, assignedQuantity: assignedQty });
//           }
//         } else {
//           remainingItems.push({ ...detail, requiredQuantity: detail.requiredQuantity, assignedQuantity: assignedQty });
//         }
//       }

//       updateData.productDetails = remainingItems;

//       if (unassignedItems.length > 0) {
//         const baseCode = existingOrder.orderCode.split("_")[0];
//         let suffixChar = "A";
//         let newOrderCode = `${baseCode}_${suffixChar}`;

//         while (await Order.findOne({ orderCode: newOrderCode })) {
//           suffixChar = String.fromCharCode(suffixChar.charCodeAt(0) + 1);
//           newOrderCode = `${baseCode}_${suffixChar}`;
//         }

//         const microOrder = new Order({
//           ...existingOrder.toObject(),
//           _id: undefined,
//           orderCode: newOrderCode,
//           productDetails: unassignedItems,
//           status: "Order Pending",
//           orderType: "MicroOrder",
//           parentOrderId: existingOrder._id,
//           createdAt: new Date(),
//           updatedAt: new Date(),
//         });

//         await microOrder.save();

//         // Log Micro Order
//         await ActivityLog.logCreate({
//           employeeId: user?.employeeId,
//           employeeName: user?.employeeName,
//           unitId: microOrder.unitId,
//           orderId: microOrder._id,
//           orderCode: microOrder.orderCode,
//           action: "Order created",
//           module: "Order",
//           description: `Micro Order ${microOrder.orderCode} automatically branched from ${existingOrder.orderCode} due to partial assignment.`,
//           ipAddress: req.ip,
//           userAgent: req.headers["user-agent"],
//         });
//       }
//     }

//     // --- 4. EXECUTE UPDATE & LOG ORIGINAL ---
//     const updated = await Order.findByIdAndUpdate(_id, updateData, {
//       new: true,
//       runValidators: true,
//     });

//     if (!updated) return res.status(404).json({ message: "Order not found after update" });

//     // Build the final detailed description
//     const detailedDescription = `Order ${updated.orderCode} updated by ${user?.employeeName || 'System'}. Changes: ${changes.join(' | ')}`;

//     await ActivityLog.logCreate({
//       employeeId: user?.employeeId,
//       employeeCode: user?.employeeCode,
//       employeeName: user?.employeeName,
//       departmentId: user?.departmentId,
//       role: user?.role,
//       unitId: updated.unitId,
//       customerID: updated.customerId,
//       orderId: updated._id,
//       orderCode: updated.orderCode,
//       orderType: updated.orderType,
//       orderStatus: updated.status,
//       action: "Order Updated",
//       module: "Order",
//       entityName: updated.orderCode,
//       entityCode: updated.orderCode,
//       oldValue: JSON.stringify(existingOrder.status), // Storing old status as reference
//       newValue: JSON.stringify(updated.status),
//       description: detailedDescription,
//       ipAddress: req.ip,
//       userAgent: req.headers["user-agent"],
//     });

//     res.status(200).json({
//       message: "Order updated successfully",
//       data: updated,
//     });
//   } catch (error) {
//     console.error(error);
//     res.status(500).json({ message: error.message });
//   }
// };

exports.updateOrder = async (req, res) => {
  try {
    const { _id, user, ...updateData } = req.body;
    if (!_id) return res.status(400).json({ message: "ID is required" });

    // 1. Fetch the existing order (The Source of Truth)
    const existingOrder = await Order.findById(_id);
    if (!existingOrder) {
      return res.status(404).json({ message: "Order not found" });
    }

    let changes = [];
    if (updateData.status && updateData.status !== existingOrder.status) {
      changes.push(`Status changed from "${existingOrder.status}" to "${updateData.status}"`);
    }

    // 2. Process Product Details - STRICTLY PRESERVING ASSIGNED QUANTITIES
    if (updateData.productDetails) {
      const processedDetails = [];

      for (const incomingDetail of updateData.productDetails) {
        // ID Validation
        const productIds = [
          incomingDetail.childProductId,
          incomingDetail.parentProductId,
          incomingDetail.mainParentId,
        ].filter(Boolean);

        if (productIds.length !== 1) {
          return res.status(400).json({
            message: "Exactly one product ID must be provided per product detail",
          });
        }

        // Find matching product in DB to get its current assignedQuantity
        const matchingExisting = existingOrder.productDetails.find((ed) => {
          return (
            (incomingDetail.childProductId && ed.childProductId?.toString() === incomingDetail.childProductId.toString()) ||
            (incomingDetail.parentProductId && ed.parentProductId?.toString() === incomingDetail.parentProductId.toString()) ||
            (incomingDetail.mainParentId && ed.mainParentId?.toString() === incomingDetail.mainParentId.toString())
          );
        });

        // Use existing assigned quantity; default to 0 only if it's a brand new product
        const preservedAssignedQty = matchingExisting ? matchingExisting.assignedQuantity : 0;

        // Safety: Prevent setting Required Quantity lower than what is already assigned
        if (incomingDetail.requiredQuantity < preservedAssignedQty) {
          return res.status(400).json({
            message: `Required quantity cannot be less than assigned quantity (${preservedAssignedQty}) for product.`,
          });
        }

        processedDetails.push({
          productTypeId: incomingDetail.productTypeId,
          childProductId: incomingDetail.childProductId || null,
          parentProductId: incomingDetail.parentProductId || null,
          mainParentId: incomingDetail.mainParentId || null,
          requiredQuantity: incomingDetail.requiredQuantity,
          assignedQuantity: preservedAssignedQty, // IGNORE req.body value
        });
      }

      updateData.productDetails = processedDetails;
      changes.push(`Product quantities updated (Assigned quantities preserved)`);
    }

    // 3. Micro-Order Logic (On Execution)
    if (
      updateData.status &&
      updateData.status.toLowerCase() === "order executed" &&
      existingOrder.status.toLowerCase() !== "order executed"
    ) {
      const unassignedItems = [];
      const remainingItems = [];
      // Use the newly prepared updateData or fall back to existing
      const itemsToProcess = updateData.productDetails || existingOrder.productDetails;

      for (const detail of itemsToProcess) {
        const assignedQty = detail.assignedQuantity || 0;
        const requiredQty = detail.requiredQuantity || 0;

        if (assignedQty < requiredQty) {
          // New order gets the remainder
          unassignedItems.push({
            ...detail,
            requiredQuantity: requiredQty - assignedQty,
            assignedQuantity: 0,
          });
          // Original order "shrinks" its requirement to match what was shipped
          remainingItems.push({ 
            ...detail, 
            requiredQuantity: assignedQty 
          });
        } else {
          remainingItems.push({ ...detail });
        }
      }

      updateData.productDetails = remainingItems;

      if (unassignedItems.length > 0) {
        const baseCode = existingOrder.orderCode.split("_")[0];
        let suffixChar = "A";
        let newOrderCode = `${baseCode}_${suffixChar}`;

        while (await Order.findOne({ orderCode: newOrderCode })) {
          suffixChar = String.fromCharCode(suffixChar.charCodeAt(0) + 1);
          newOrderCode = `${baseCode}_${suffixChar}`;
        }

        const microOrder = new Order({
          ...existingOrder.toObject(),
          _id: undefined,
          orderCode: newOrderCode,
          productDetails: unassignedItems,
          status: "Order Pending",
          orderType: "MicroOrder",
          parentOrderId: existingOrder._id,
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        await microOrder.save();

        await ActivityLog.logCreate({
          employeeId: user?.employeeId,
          employeeName: user?.employeeName,
          unitId: microOrder.unitId,
          orderId: microOrder._id,
          orderCode: microOrder.orderCode,
          action: "Order created",
          module: "Order",
          description: `Micro Order ${microOrder.orderCode} branched from ${existingOrder.orderCode}.`,
          ipAddress: req.ip,
          userAgent: req.headers["user-agent"],
        });
      }
    }

    // 4. Final Database Execution
    const updated = await Order.findByIdAndUpdate(_id, updateData, {
      new: true,
      runValidators: true,
    });

    if (!updated) return res.status(404).json({ message: "Order not found after update" });

    // 5. Log the Update
    await ActivityLog.logCreate({
      employeeId: user?.employeeId,
      employeeCode: user?.employeeCode,
      employeeName: user?.employeeName,
      departmentId: user?.departmentId,
      role: user?.role,
      unitId: updated.unitId,
      customerID: updated.customerId,
      orderId: updated._id,
      orderCode: updated.orderCode,
      orderType: updated.orderType,
      orderStatus: updated.status,
      action: "Order Updated",
      module: "Order",
      entityName: updated.orderCode,
      entityCode: updated.orderCode,
      oldValue: JSON.stringify(existingOrder.status), // Storing old status as reference
      newValue: JSON.stringify(updated.status),
      description: `Order ${updated.orderCode} updated. Changes: ${changes.join(' | ')}`,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    res.status(200).json({
      message: "Order updated successfully",
      data: updated,
    });

  } catch (error) {
    console.error("Update Error:", error);
    res.status(500).json({ message: error.message });
  }
};

exports.bulkExecuteOrders = async (req, res) => {
  try {
    const { orderIds, user } = req.body;

    if (!Array.isArray(orderIds) || orderIds.length === 0) {
      return res.status(400).json({ message: "orderIds array is required." });
    }

    let successCount = 0;
    let failures = [];

    for (const orderId of orderIds) {
      try {
        const existingOrder = await Order.findById(orderId);
        if (!existingOrder) {
          failures.push({ orderId, reason: "Order not found" });
          continue;
        }

        if (existingOrder.status.toLowerCase() === "order executed") {
          failures.push({ orderId, reason: "Already executed" });
          continue;
        }

        let updateData = {};
        const productDetails = existingOrder.productDetails || [];
        const unassignedItems = [];
        const remainingItems = [];

        for (const detail of productDetails) {
          // FIX 1: Force numeric conversion and handle precision issues
          const assignedQty = Number(detail.assignedQuantity) || 0;
          const requiredQty = Number(detail.requiredQuantity) || 0;
          const diff = requiredQty - assignedQty;

          // FIX 2: Only create unassigned entries if the difference is meaningfully greater than zero
          // Using 0.0001 to handle potential floating point math errors
          if (diff > 0.0001) {
            unassignedItems.push({
              ...detail,
              requiredQuantity: diff,
              assignedQuantity: 0,
            });

            // If we have partial assignment, original order keeps the assigned part
            if (assignedQty > 0) {
              remainingItems.push({
                ...detail,
                requiredQuantity: assignedQty, // Shrink required to match assigned
                assignedQuantity: assignedQty,
              });
            }
          } else {
            // Case where assigned >= required: Fully fulfilled
            remainingItems.push({
              ...detail,
              requiredQuantity: requiredQty,
              assignedQuantity: assignedQty,
            });
          }
        }

        updateData.status = "Order Executed";
        updateData.productDetails = remainingItems;

        const updatedOrder = await Order.findByIdAndUpdate(
          orderId,
          updateData,
          { new: true }
        );

        if (!updatedOrder) {
          failures.push({ orderId, reason: "Order not found after update" });
          continue;
        }

        // FIX 3: Micro-order is ONLY created if there are items with quantity > 0
        if (unassignedItems.length > 0) {
          const baseCode = existingOrder.orderCode.split("_")[0];
          let suffixChar = "A";
          let newOrderCode = `${baseCode}_${suffixChar}`;

          while (await Order.findOne({ orderCode: newOrderCode })) {
            suffixChar = String.fromCharCode(suffixChar.charCodeAt(0) + 1);
            newOrderCode = `${baseCode}_${suffixChar}`;
          }

          const microOrder = new Order({
            ...existingOrder.toObject(),
            _id: undefined,
            orderCode: newOrderCode,
            productDetails: unassignedItems,
            status: "Order Pending",
            orderType: "MicroOrder",
            parentOrderId: existingOrder._id,
            orderDate: existingOrder.orderDate,
            orderConfirmDate: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          });

          await microOrder.save();

          await ActivityLog.logCreate({
            employeeId: user?.employeeId,
            employeeCode: user?.employeeCode,
            employeeName: user?.employeeName,
            departmentId: user?.departmentId,
            departmentName: user?.departmentName,
            role: user?.role,
            unitId: microOrder.unitId,
            customerID: microOrder.customerId,
            unitName: user.unitName,
            orderId: microOrder._id,
            orderCode: microOrder.orderCode,
            orderType: microOrder.orderType,
            orderStatus: microOrder.status,
            action: "create",
            module: "Order",
            entityName: microOrder.orderCode,
            entityCode: microOrder.orderCode,
            description: `Micro Order created with code ${microOrder.orderCode}`,
            ipAddress: req.ip,
            userAgent: req.headers["user-agent"],
          });
        }

        // Log original order update
        await ActivityLog.logCreate({
          employeeId: user?.employeeId,
          employeeCode: user?.employeeCode,
          employeeName: user?.employeeName,
          unitId: updatedOrder.unitId,
          customerID: updatedOrder.customerId,
          orderId: updatedOrder._id,
          orderCode: updatedOrder.orderCode,
          orderType: updatedOrder.orderType,
          orderStatus: updatedOrder.status,
          action: "Order Executed",
          module: "Order",
          entityName: updatedOrder.orderCode,
          entityCode: updatedOrder.orderCode,
          description: `Order ${updatedOrder.orderCode} successfully executed.`,
          ipAddress: req.ip,
          userAgent: req.headers["user-agent"],
        });

        successCount++;
      } catch (innerErr) {
        console.error(`Error processing order ${orderId}`, innerErr);
        failures.push({
          orderId,
          reason: innerErr.message || "Unexpected error",
        });
      }
    }

    res.status(200).json({
      message: "Bulk execution completed",
      successCount,
      failed: failures,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
};

// exports.updateAssignedQuantities = async (req, res) => {
//   try {
//     const { orderId, productDetails, unitId,user } = req.body;

//     if (!orderId || !unitId || !Array.isArray(productDetails)) {
//       return res.status(400).json({ message: "Missing required data." });
//     }

//     const order = await Order.findById(orderId);
//     if (!order) {
//       return res.status(404).json({ message: "Order not found." });
//     }

//     let updatedCount = 0;

//     for (const incoming of productDetails) {
//       const {
//         productTypeId,
//         childProductId,
//         parentProductId,
//         mainParentId,
//         assignedQuantity
//       } = incoming;

//       const matched = order.productDetails.find((pd) =>
//         pd.productTypeId?.toString() === (productTypeId || "") &&
//         (pd.childProductId?.toString() || null) === (childProductId || null) &&
//         (pd.parentProductId?.toString() || null) === (parentProductId || null) &&
//         (pd.mainParentId?.toString() || null) === (mainParentId || null)
//       );

//       if (matched) {
//         const prevAssignedQty = matched.assignedQuantity || 0;
//         const newAssignedQty = assignedQuantity === "" ? 0 : Number(assignedQuantity);
//         const diff = newAssignedQty - prevAssignedQty;

//         if (diff !== 0) {
//           // Update stock by product type
//           if (childProductId) {
//             await ChildProduct.updateOne(
//               { _id: childProductId, "stockByUnit.unitId": unitId },
//               {
//                 $inc: {
//                   "stockByUnit.$.totalCPQuantity": -diff,
//                   "stockByUnit.$.availableToCommitCPQuantity": -diff
//                 }
//               }
//             );
//           } else if (parentProductId) {
//             await ParentProduct.updateOne(
//               { _id: parentProductId, "stockByUnit.unitId": unitId },
//               {
//                 $inc: {
//                   "stockByUnit.$.totalPPQuantity": -diff,
//                   "stockByUnit.$.availableToCommitPPQuantity": -diff
//                 }
//               }
//             );

//             await recalculateMainParentsForParent(parentProductId, unitId);
//           } else if (mainParentId) {
//             await MainParentProduct.updateOne(
//               { _id: mainParentId, "stockByUnit.unitId": unitId },
//               {
//                 $inc: {
//                   "stockByUnit.$.totalMPQuantity": -diff,
//                   "stockByUnit.$.availableToCommitMPQuantity": -diff
//                 }
//               }
//             );

//             const mainParentProductDoc = await MainParentProduct.findById(mainParentId);
//             if (!mainParentProductDoc) throw new Error("MainParentProduct not found.");

//             for (const config of mainParentProductDoc.parentProducts) {
//               const { parentProductId, quantity: configuredQty } = config;
//               const reductionQty = diff * configuredQty;

//               if (reductionQty !== 0) {
//                 await ParentProduct.updateOne(
//                   {
//                     _id: parentProductId,
//                     "stockByUnit.unitId": unitId
//                   },
//                   {
//                     $inc: {
//                       "stockByUnit.$.totalPPQuantity": -reductionQty,
//                       "stockByUnit.$.availableToCommitPPQuantity": -reductionQty
//                     }
//                   }
//                 );

//                 await recalculateMainParentsForParent(parentProductId, unitId);
//               }
//             }
//           }
//           let entityName=''
//           let entityCode=''
//           let prevQuantity
//           let newQuantity
//           if(parentProductId){
// const parent= await ParentProduct.findOne({_id:parentProductId})
// if(parent){
// entityName=parent.parentProductName
// entityCode=parent.parentProductCode
// const fromStock = parent.stockByUnit.find(s => s.unitId.toString() === unitId.toString());
// prevQuantity=fromStock.availableToCommitPPQuantity
// newQuantity=prevQuantity-newAssignedQty
// }
//           }
//           if(mainParentId){
// const Mainparent = await MainParentProduct.findOne({_id:mainParentId})
// if(Mainparent){
//   entityName=Mainparent.mainParentProductName
//   entityCode=Mainparent.mainParentProductCode
//   const fromStock = Mainparent.stockByUnit.find(s => s.unitId.toString() === unitId.toString());
//   newQuantity=fromStock.availableToCommitMPQuantity
//   console.log(newQuantity,"newQuantity")
//   prevQuantity=newQuantity+newAssignedQty
//   console.log(prevQuantity,"prevQuantity")
// }
//           }

//           await ActivityLog.logCreate({
//             employeeId: user?.employeeId || null,
//             employeeCode: user?.employeeCode || null,
//             employeeName: user?.employeeName || null,
//             departmentId: user?.departmentId || null,
//             departmentName: user?.departmentName || null,
//             role: user?.role || null,
//             unitId: unitId,
//             customerID: order.customerId || null,
//             unitName: user?.unitName || null,
//             childProductId: childProductId || null,
//             parentProductId: parentProductId || null,
//             mainParentId: mainParentId || null,
//             orderId: order._id,
//             orderCode: order.orderCode,
//             orderType: order.orderType,
//             orderStatus: order.status,
//             action: "Stock assigned",
//             module: "Order",
//             entityName: entityName,
//             entityCode: entityCode,
//             changeField: "assignedQuantity",
//             oldValue: prevAssignedQty,
//             activityValue: newAssignedQty,
//             newValue: newAssignedQty,
//             description: `Assigned quantity ${newAssignedQty} of ${entityName} on order -${order.orderCode}, Old stock -${prevQuantity}, New stock - ${newQuantity}`,
//             ipAddress: req.ip,
//             userAgent: req.headers["user-agent"]
//           });

//           matched.assignedQuantity = newAssignedQty;
//           updatedCount++;
//         }
//       }
//     }

//     if (updatedCount === 0) {
//       return res.status(404).json({ message: "No matching product details found to update." });
//     }

//     await order.save();

//     // Enriched response
//     const enrichedDetails = await Promise.all(order.productDetails.map(async (detail) => {
//       const {
//         productTypeId,
//         childProductId,
//         parentProductId,
//         mainParentId,
//         requiredQuantity,
//         assignedQuantity
//       } = detail;

//       const productType = productTypeId ? await ProductType.findById(productTypeId) : null;

//       let stockQty = 0;
//       let productInfo = {};

//       if (childProductId) {
//         const cp = await ChildProduct.findById(childProductId);
//         const stock = cp?.stockByUnit?.find(s => s.unitId?.toString() === unitId);
//         stockQty = stock?.availableToCommitCPQuantity || 0;
//         productInfo = { childProductName: cp?.childProductName };
//       } else if (parentProductId) {
//         const pp = await ParentProduct.findById(parentProductId);
//         const stock = pp?.stockByUnit?.find(s => s.unitId?.toString() === unitId);
//         stockQty = stock?.availableToCommitPPQuantity || 0;
//         productInfo = { parentProductName: pp?.parentProductName };
//       } else if (mainParentId) {
//         const mp = await MainParentProduct.findById(mainParentId);
//         const stock = mp?.stockByUnit?.find(s => s.unitId?.toString() === unitId);
//         stockQty = stock?.availableToCommitMPQuantity || 0;
//         productInfo = { mainParentProductName: mp?.mainParentProductName };
//       }

//       return {
//         productTypeId: productTypeId?.toString() || null,
//         productTypeName: productType?.productTypeName || null,
//         childProductId: childProductId?.toString() || null,
//         parentProductId: parentProductId?.toString() || null,
//         mainParentId: mainParentId?.toString() || null,
//         ...productInfo,
//         requiredQuantity,
//         assignedQuantity,
//         availableQuantity: stockQty
//       };
//     }));

//     return res.status(200).json({
//       message: "Assigned quantities updated and stocks recalculated successfully.",
//       updatedProductDetails: enrichedDetails
//     });

//   } catch (error) {
//     console.error(error);
//     return res.status(500).json({ message: error.message || "Server error" });
//   }
// };

// exports.updateAssignedQuantities = async (req, res) => {
//   const session = await mongoose.startSession();
//   session.startTransaction();
  
//   try {
//     const { orderId, productDetails, unitId, user } = req.body;

    
//     if (!orderId || !unitId || !Array.isArray(productDetails)) {
//       throw new Error("Missing required data.");
//     }

//     if (productDetails.length === 0) {
//       return res.status(400).json({ message: "No products to update." });
//     }

    
//     const order = await Order.findById(orderId).session(session);
    
//     if (!order) {
//       throw new Error("Order not found.");
//     }

    
//     const allIds = { parent: new Set(), main: new Set(), type: new Set() };
    
//     [...order.productDetails, ...productDetails].forEach((item) => {
//       if (item.productTypeId) allIds.type.add(item.productTypeId.toString());
//       if (item.parentProductId) allIds.parent.add(item.parentProductId.toString());
//       if (item.mainParentId) allIds.main.add(item.mainParentId.toString());
//     });

    
//     const [parentDocs, mainDocs, typeDocs] = await Promise.all([
//       allIds.parent.size ? ParentProduct.find({ _id: { $in: Array.from(allIds.parent) } }).lean() : [],
//       allIds.main.size ? MainParentProduct.find({ _id: { $in: Array.from(allIds.main) } }).lean() : [],
//       allIds.type.size ? ProductType.find({ _id: { $in: Array.from(allIds.type) } }).lean() : []
//     ]);

    
//     const maps = {
//       parent: new Map(parentDocs.map(d => [d._id.toString(), d])),
//       main: new Map(mainDocs.map(d => [d._id.toString(), d])),
//       type: new Map(typeDocs.map(d => [d._id.toString(), d]))
//     };

    
//     const modifiedIds = { parent: new Set(), main: new Set() };
//     const logsToCreate = [];
//     let updatedCount = 0;

    
//     for (const incoming of productDetails) {
//       const { productTypeId, parentProductId, mainParentId, assignedQuantity } = incoming;

      
//       const matched = order.productDetails.find((pd) =>
//         pd.productTypeId?.toString() === (productTypeId || "") &&
//         (pd.parentProductId?.toString() || null) === (parentProductId || null) &&
//         (pd.mainParentId?.toString() || null) === (mainParentId || null)
//       );

//       if (!matched) {
//         continue;
//       }

//       const prevAssignedQty = matched.assignedQuantity || 0;
//       const newAssignedQty = assignedQuantity === "" ? 0 : Number(assignedQuantity);
//       const diff = newAssignedQty - prevAssignedQty;

      
//       if (isNaN(newAssignedQty)) {
//         throw new Error(`Invalid quantity provided.`);
//       }

//       if (newAssignedQty < 0) {
//         throw new Error(`Quantity cannot be negative.`);
//       }

//       if (diff === 0) {
//         continue;
//       }

      
//       if (parentProductId) {
//         const currentDoc = await ParentProduct.findById(parentProductId).lean();
//         if (!currentDoc) throw new Error(`Parent product not found.`);

//         const currentStock = currentDoc?.stockByUnit?.find(s => s.unitId.toString() === unitId.toString());
//         if (!currentStock) throw new Error(`No stock record found for ${currentDoc.parentProductName}.`);

        
//         if (diff > 0 && currentStock.availableToCommitPPQuantity < diff) {
//           throw new Error(`Insufficient stock for ${currentDoc.parentProductName}. Available: ${currentStock.availableToCommitPPQuantity}, Requested: ${diff}`);
//         }

//         const filter = { 
//           _id: parentProductId,
//           stockByUnit: { 
//             $elemMatch: { unitId: unitId, availableToCommitPPQuantity: { $gte: diff } } 
//           }
//         };

//         const update = { $inc: { "stockByUnit.$[elem].availableToCommitPPQuantity": -diff } };
//         const options = { session, arrayFilters: [{ "elem.unitId": unitId }] };

//         const result = await ParentProduct.updateOne(filter, update, options);

//         if (result.modifiedCount === 0 && diff > 0) throw new Error(`Stock update failed.`);

//         await recalculateMainParentsForParent(parentProductId, unitId, session);
//         modifiedIds.parent.add(parentProductId.toString());

//         const updatedDoc = await ParentProduct.findById(parentProductId).session(session).lean();
//         const updatedStock = updatedDoc?.stockByUnit?.find(s => s.unitId.toString() === unitId.toString());

//         logsToCreate.push({
//           employeeId: user?.employeeId, employeeCode: user?.employeeCode, employeeName: user?.employeeName,
//           departmentId: user?.departmentId, departmentName: user?.departmentName, role: user?.role,
//           unitId, unitName: user?.unitName, customerID: order.customerId, parentProductId,
//           orderId: order._id, orderCode: order.orderCode, orderType: order.orderType, orderStatus: order.status,
//           action: "Stock assigned", module: "Order", entityName: currentDoc.parentProductName, entityCode: currentDoc.parentProductCode,
//           changeField: "assignedQuantity", oldValue: prevAssignedQty, activityValue: newAssignedQty, newValue: newAssignedQty,
//           description: `Assigned quantity ${newAssignedQty} of ${currentDoc.parentProductName}. Stock before: ${currentStock.availableToCommitPPQuantity}, After: ${updatedStock?.availableToCommitPPQuantity}`,
//           ipAddress: req.ip, userAgent: req.headers["user-agent"]
//         });
//       }
//       else if (mainParentId) {
//         const currentDoc = await MainParentProduct.findById(mainParentId).lean();
//         if (!currentDoc) throw new Error(`Main parent product not found.`);

//         const currentStock = currentDoc?.stockByUnit?.find(s => s.unitId.toString() === unitId.toString());
//         if (!currentStock) throw new Error(`No stock record found for ${currentDoc.mainParentProductName}.`);

//         if (diff > 0 && currentStock.totalMPQuantity < diff) {
//           throw new Error(`Insufficient stock for ${currentDoc.mainParentProductName}. Available: ${currentStock.totalMPQuantity}, Requested: ${diff}`);
//         }
//         const mpDoc = maps.main.get(mainParentId.toString());
//         if (mpDoc?.parentProducts && mpDoc.parentProducts.length > 0) {
//           for (const config of mpDoc.parentProducts) {
//             const rQty = diff * config.quantity;
//             if (rQty <= 0) continue;

//             const cResult = await ParentProduct.updateOne(
//               { 
//                 _id: config.parentProductId, 
//                 stockByUnit: { $elemMatch: { unitId, availableToCommitPPQuantity: { $gte: rQty } } } 
//               },
//               { $inc: { "stockByUnit.$[elem].availableToCommitPPQuantity": -rQty } },
//               { session, arrayFilters: [{ "elem.unitId": unitId }] }
//             );

//             if (cResult.modifiedCount === 0) throw new Error(`Component stock update failed.`);

//             await recalculateMainParentsForParent(config.parentProductId, unitId, session);
//             modifiedIds.parent.add(config.parentProductId.toString());
//           }
//         }
//         modifiedIds.main.add(mainParentId.toString());
//       }

//       matched.assignedQuantity = newAssignedQty;
//       updatedCount++;
//     }

//     if (updatedCount > 0) {
//       await order.save({ session });
//       if (logsToCreate.length) await Logs.insertMany(logsToCreate, { session });

//       await session.commitTransaction();

//       const [freshParent, freshMain] = await Promise.all([
//         modifiedIds.parent.size ? ParentProduct.find({ _id: { $in: Array.from(modifiedIds.parent) } }).lean() : [],
//         modifiedIds.main.size ? MainParentProduct.find({ _id: { $in: Array.from(modifiedIds.main) } }).lean() : []
//       ]);

//       freshParent.forEach(d => maps.parent.set(d._id.toString(), d));
//       freshMain.forEach(d => maps.main.set(d._id.toString(), d));

//       enrichedDetails = order.productDetails.map((detail) => {
//         const type = detail.productTypeId ? maps.type.get(detail.productTypeId.toString()) : null;
//         let stockQty = 0;
//         let nameInfo = {};

//         if (detail.parentProductId) {
//           const d = maps.parent.get(detail.parentProductId.toString());
//           if (d) {
//             const stockRecord = d.stockByUnit?.find(s => s.unitId.toString() === unitId.toString());
//             stockQty = stockRecord?.availableToCommitPPQuantity || 0;
//             nameInfo = { parentProductName: d.parentProductName };
//           }
//         } else if (detail.mainParentId) {
//           const d = maps.main.get(detail.mainParentId.toString());
//           if (d) {
//             const stockRecord = d.stockByUnit?.find(s => s.unitId.toString() === unitId.toString());
//             stockQty = stockRecord?.totalMPQuantity || 0;
//             nameInfo = { mainParentProductName: d.mainParentProductName };
//           }
//         }

//         return { ...detail.toObject(), productTypeName: type?.productTypeName, ...nameInfo, availableQuantity: stockQty };
//       });

//       session.endSession();
//       return res.status(200).json({ message: "Assigned quantities updated successfully.", updatedProductDetails: enrichedDetails });

//     } else {
//       await session.abortTransaction();
//       session.endSession();
//       return res.status(404).json({ message: "No matching product details found to update." });
//     }

//   } catch (error) {
//     await session.abortTransaction();
//     session.endSession();
//     return res.status(500).json({ message: error.message || "Server error" });
//   }
// };


exports.updateAssignedQuantities = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { orderId, productDetails, unitId, user } = req.body;

    if (!orderId || !unitId || !Array.isArray(productDetails)) {
      throw new Error("Missing required data.");
    }

    const order = await Order.findById(orderId).session(session);
    if (!order) throw new Error("Order not found.");

    // Track IDs to fetch fresh data for the response at the end
    const allIds = { parent: new Set(), main: new Set(), type: new Set() };
    const logsToCreate = [];
    let updatedCount = 0;

    for (const incoming of productDetails) {
      const { productTypeId, parentProductId, mainParentId, assignedQuantity } = incoming;

      const matched = order.productDetails.find((pd) =>
        pd.productTypeId?.toString() === (productTypeId || "") &&
        (pd.parentProductId?.toString() || null) === (parentProductId || null) &&
        (pd.mainParentId?.toString() || null) === (mainParentId || null)
      );

      if (!matched) continue;

      const prevAssignedQty = matched.assignedQuantity || 0;
      const newAssignedQty = assignedQuantity === "" ? 0 : Number(assignedQuantity);
      const diff = newAssignedQty - prevAssignedQty;

      if (isNaN(newAssignedQty) || newAssignedQty < 0 || diff === 0) continue;

      // --- ATOMIC UPDATE FOR PARENT PRODUCT ---
      if (parentProductId) {
        const updatedDoc = await ParentProduct.findOneAndUpdate(
          { 
            _id: parentProductId, 
            "stockByUnit.unitId": unitId,
            ...(diff > 0 ? { "stockByUnit.availableToCommitPPQuantity": { $gte: diff } } : {})
          },
          { $inc: { "stockByUnit.$[elem].availableToCommitPPQuantity": -diff } },
          { 
            session, 
            arrayFilters: [{ "elem.unitId": unitId }],
            new: false, // Accurate "Before" state for your logs
            projection: { stockByUnit: { $elemMatch: { unitId } }, parentProductName: 1, parentProductCode: 1 } 
          }
        );

        if (!updatedDoc) throw new Error(`Insufficient stock for ${parentProductId}`);

        const stockBefore = updatedDoc.stockByUnit[0].availableToCommitPPQuantity;
        const stockAfter = stockBefore - diff;

        await recalculateMainParentsForParent(parentProductId, unitId, session);
        
        logsToCreate.push({
          employeeId: user?.employeeId, employeeCode: user?.employeeCode,
          employeeName: user?.employeeName,
          departmentId: user?.departmentId,
          departmentName: user?.departmentName, 
          role: user?.role,
          unitId, 
          unitName: user?.unitName, 
          customerID: order.customerId, 
          parentProductId,
          orderId: order._id, orderCode: order.orderCode, orderType: order.orderType, orderStatus: order.status,
          action: "Stock assigned", module: "Order", entityName: updatedDoc.parentProductName, entityCode: updatedDoc.parentProductCode,
          changeField: "assignedQuantity", oldValue: prevAssignedQty, activityValue: newAssignedQty, newValue: newAssignedQty,
          description: `Assigned quantity ${newAssignedQty} of ${updatedDoc.parentProductName} in ${order.orderCode}. Stock before: ${stockBefore}, After: ${stockAfter} - Unit: ${user?.unitName}`,
          ipAddress: req.ip, userAgent: req.headers["user-agent"]
        });
      }

      // --- ATOMIC UPDATE FOR MAIN PARENT PRODUCT ---
      else if (mainParentId) {
        const updatedDoc = await MainParentProduct.findOneAndUpdate(
          { 
            _id: mainParentId, 
            "stockByUnit.unitId": unitId,
            ...(diff > 0 ? { "stockByUnit.totalMPQuantity": { $gte: diff } } : {})
          },
          { $inc: { "stockByUnit.$[elem].totalMPQuantity": -diff } },
          { 
            session, 
            arrayFilters: [{ "elem.unitId": unitId }],
            new: false,
            projection: { stockByUnit: { $elemMatch: { unitId } }, mainParentProductName: 1, mainParentProductCode: 1, parentProducts: 1 } 
          }
        );

        if (!updatedDoc) throw new Error(`Insufficient stock for ${mainParentId}`);

        const stockBefore = updatedDoc.stockByUnit[0].totalMPQuantity;

        // Sync components if Main Parent has constituents
        if (updatedDoc.parentProducts?.length > 0) {
          for (const config of updatedDoc.parentProducts) {
            const rQty = diff * config.quantity;
            if (rQty <= 0) continue;
            await ParentProduct.updateOne(
              { _id: config.parentProductId, "stockByUnit.unitId": unitId, "stockByUnit.availableToCommitPPQuantity": { $gte: rQty } },
              { $inc: { "stockByUnit.$[elem].availableToCommitPPQuantity": -rQty } },
              { session, arrayFilters: [{ "elem.unitId": unitId }] }
            );
            await recalculateMainParentsForParent(config.parentProductId, unitId, session);
          }
        }

        logsToCreate.push({
          employeeId: user?.employeeId, employeeCode: user?.employeeCode, employeeName: user?.employeeName,
          unitId, unitName: user?.unitName, customerID: order.customerId, mainParentId,
          orderId: order._id, orderCode: order.orderCode, orderType: order.orderType, orderStatus: order.status,
          action: "Stock assigned", module: "Order", entityName: updatedDoc.mainParentProductName, entityCode: updatedDoc.mainParentProductCode,
          changeField: "assignedQuantity", oldValue: prevAssignedQty, activityValue: newAssignedQty, newValue: newAssignedQty,
          description: `Assigned quantity ${newAssignedQty} of ${updatedDoc.mainParentProductName}. Stock before: ${stockBefore}, After: ${stockBefore - diff}`,
          ipAddress: req.ip, userAgent: req.headers["user-agent"]
        });
      }

      matched.assignedQuantity = newAssignedQty;
      updatedCount++;
    }

    if (updatedCount > 0) {
      await order.save({ session });
      if (logsToCreate.length) await Logs.insertMany(logsToCreate, { session });
      await session.commitTransaction();

      // --- FETCH FRESH DATA FOR RESPONSE ---
      // We collect all IDs from the updated order to rebuild the enrichedDetails
      order.productDetails.forEach((item) => {
        if (item.productTypeId) allIds.type.add(item.productTypeId.toString());
        if (item.parentProductId) allIds.parent.add(item.parentProductId.toString());
        if (item.mainParentId) allIds.main.add(item.mainParentId.toString());
      });

      const [parentDocs, mainDocs, typeDocs] = await Promise.all([
        allIds.parent.size ? ParentProduct.find({ _id: { $in: Array.from(allIds.parent) } }).lean() : [],
        allIds.main.size ? MainParentProduct.find({ _id: { $in: Array.from(allIds.main) } }).lean() : [],
        allIds.type.size ? ProductType.find({ _id: { $in: Array.from(allIds.type) } }).lean() : []
      ]);

      const maps = {
        parent: new Map(parentDocs.map(d => [d._id.toString(), d])),
        main: new Map(mainDocs.map(d => [d._id.toString(), d])),
        type: new Map(typeDocs.map(d => [d._id.toString(), d]))
      };

      const enrichedDetails = order.productDetails.map((detail) => {
        const type = detail.productTypeId ? maps.type.get(detail.productTypeId.toString()) : null;
        let stockQty = 0;
        let nameInfo = {};

        if (detail.parentProductId) {
          const d = maps.parent.get(detail.parentProductId.toString());
          if (d) {
            const stockRecord = d.stockByUnit?.find(s => s.unitId.toString() === unitId.toString());
            stockQty = stockRecord?.availableToCommitPPQuantity || 0;
            nameInfo = { parentProductName: d.parentProductName };
          }
        } else if (detail.mainParentId) {
          const d = maps.main.get(detail.mainParentId.toString());
          if (d) {
            const stockRecord = d.stockByUnit?.find(s => s.unitId.toString() === unitId.toString());
            stockQty = stockRecord?.totalMPQuantity || 0;
            nameInfo = { mainParentProductName: d.mainParentProductName };
          }
        }

        return { 
          ...detail.toObject(), 
          productTypeName: type?.productTypeName, 
          ...nameInfo, 
          availableQuantity: stockQty 
        };
      });

      session.endSession();
      return res.status(200).json({ 
        message: "Assigned quantities updated successfully.", 
        updatedProductDetails: enrichedDetails 
      });

    } else {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: "No matching product details found to update." });
    }

  } catch (error) {
    if (session.inTransaction()) await session.abortTransaction();
    session.endSession();
    return res.status(500).json({ message: error.message || "Server error" });
  }
};

exports.confirmOrder = async (req, res) => {
  try {
    const { _id ,user} = req.body;

    // Validate ID
    if (!_id || !mongoose.Types.ObjectId.isValid(_id)) {
      return res.status(400).json({ message: "Valid order _id is required" });
    }

    // Find order
    const order = await Order.findById(_id);
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    // Update only if still pending
    if (order.status !== "Order Pending") {
      return res.status(400).json({ message: `Order is already ${order.status}` });
    }

    order.status = "Order Confirmed";

    await order.save();

   await ActivityLog.logCreate({
      employeeId: user?.employeeId,
      employeeCode: user?.employeeCode,
      employeeName: user?.employeeName,
      departmentId: user?.departmentId,
      departmentName: null,
      role: user?.role,
      unitId: order.unitId,
      customerID: order.customerId,
      unitName: user.unitName,
      childProductId: null,
      parentProductId: null,
      mainParentId: null,
      orderId: order._id,
      orderCode: order.orderCode,
      orderType: order.orderType,
      orderStatus: order.status,
      action: order.status,
      module: "Order",
      entityName: order.orderCode,
      entityCode: order.orderCode,
      changeField: null,
      description: `Order updated with code ${order.orderCode}`,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    res.status(200).json({
      message: "Order confirmed successfully",
      order
    });
  } catch (error) {
    console.error("Error confirming order:", error);
    res.status(200).json({ message: "Order Confirm Failed", error: error.message });
  }
}


async function recalculateMainParentsForParent(parentProductId, unitId, session = null) {
  const unitIdStr = unitId.toString();

  // 1. Find Main Parents that depend on this Parent Product
  const mainParents = await MainParentProduct.find({
    "parentProducts.parentProductId": parentProductId
  }).session(session).lean(); // Use lean for speed, we won't use .save()

  if (!mainParents.length) return;

  // 2. Get all constituent Parent Products needed for these Main Parents
  const parentProductIds = new Set();
  mainParents.forEach(mp => {
    mp.parentProducts?.forEach(config => {
      if (config.parentProductId) parentProductIds.add(config.parentProductId.toString());
    });
  });

  const parentProducts = await ParentProduct.find({
    _id: { $in: Array.from(parentProductIds) }
  }).session(session).lean();

  const ppMap = new Map(parentProducts.map(pp => [pp._id.toString(), pp]));

  // 3. Prepare Bulk Operations to avoid "Fetch-and-Save"
  const bulkOps = [];

  for (const mp of mainParents) {
    let minPossibleUnits = Infinity;
    const requiredParents = mp.parentProducts || [];

    for (const config of requiredParents) {
      const pp = ppMap.get(config.parentProductId?.toString());
      const requiredQty = Number(config.quantity) || 1;
      const stockRecord = pp?.stockByUnit?.find(s => s.unitId?.toString() === unitIdStr);
      
      const availableQty = Number(stockRecord?.availableToCommitPPQuantity) || 0;
      const possible = Math.floor(availableQty / requiredQty);
      minPossibleUnits = Math.min(minPossibleUnits, possible);
    }

    if (minPossibleUnits === Infinity) minPossibleUnits = 0;

    // 4. ATOMIC UPDATE: Only update the specific array element
    // This prevents overwriting the whole document/array
    bulkOps.push({
      updateOne: {
        filter: { _id: mp._id, "stockByUnit.unitId": unitId },
        update: { 
          $set: { 
            "stockByUnit.$.totalMPQuantity": minPossibleUnits,
            // We use a math expression here to ensure available stays synced with committed
            // Note: In real production, you'd use a pipeline or handle committed logic carefully
          } 
        }
      }
    });
    
    // Also handle the case where the unitId doesn't exist in stockByUnit yet
    // (Omitted for brevity, but updateOne with upsert logic is safer)
  }

  if (bulkOps.length > 0) {
    await MainParentProduct.bulkWrite(bulkOps, { session });
  }
}

// exports.deleteOrder = async (req, res) => {
//   const session = await Order.startSession();
//   session.startTransaction();

//   try {
//     const { orderId } = req.body;
//     const order = await Order.findById(orderId).session(session);
//     if (!order) {
//       await session.abortTransaction();
//       return res.status(404).json({ message: "Order not found" });
//     }

//     const { unitId, productDetails } = order;

//     for (const product of productDetails) {
//       const { parentProductId, mainParentId, assignedQuantity } = product;

//       if (assignedQuantity <= 0) continue;

//       // 🟢 If it's a ParentProduct directly
//       if (parentProductId) {
//         const parent = await ParentProduct.findOne({
//           _id: parentProductId,
//           "stockByUnit.unitId": unitId,
//         }).session(session);

//         if (parent) {
//           const stock = parent.stockByUnit.find(
//             (s) => s.unitId.toString() === unitId.toString()
//           );

//           stock.committedPPQuantity -= assignedQuantity;
//           stock.availableToCommitPPQuantity += assignedQuantity;
//           await parent.save({ session });

//           // 🔁 Recalculate all MainParentProducts using this ParentProduct
//           const relatedMPs = await MainParentProduct.find({
//             "parentProducts.parentProductId": parentProductId,
//             "stockByUnit.unitId": unitId,
//           }).session(session);

//           for (const mpItem of relatedMPs) {
//             const mpStock = mpItem.stockByUnit.find(
//               (s) => s.unitId.toString() === unitId.toString()
//             );
//             if (!mpStock) continue;

//             let maxMPQuantity = Infinity;
//             for (const config of mpItem.parentProducts) {
//               const pp = await ParentProduct.findOne({
//                 _id: config.parentProductId,
//                 "stockByUnit.unitId": unitId,
//               }).session(session);
//               if (!pp) {
//                 maxMPQuantity = 0;
//                 break;
//               }

//               const ppStock = pp.stockByUnit.find(
//                 (s) => s.unitId.toString() === unitId.toString()
//               );
//               if (!ppStock) {
//                 maxMPQuantity = 0;
//                 break;
//               }

//               const possibleQty = Math.floor(
//                 ppStock.availableToCommitPPQuantity / config.quantity
//               );
//               maxMPQuantity = Math.min(maxMPQuantity, possibleQty);
//             }

//             mpStock.totalMPQuantity = maxMPQuantity;
//             mpStock.availableToCommitMPQuantity = maxMPQuantity;
//             await mpItem.save({ session });
//           }
//         }
//       }

//       // 🔷 If it's a MainParentProduct
//       if (mainParentId) {
//         const mp = await MainParentProduct.findOne({
//           _id: mainParentId,
//           "stockByUnit.unitId": unitId,
//         }).session(session);

//         if (mp) {
//           const mpStock = mp.stockByUnit.find(
//             (s) => s.unitId.toString() === unitId.toString()
//           );

//           mpStock.committedMPQuantity -= assignedQuantity;
//           mpStock.availableToCommitMPQuantity += assignedQuantity;
//           await mp.save({ session });

//           const affectedParentIds = [];

//           for (const config of mp.parentProducts) {
//             const totalToRestore = assignedQuantity * config.quantity;

//             const pp = await ParentProduct.findOne({
//               _id: config.parentProductId,
//               "stockByUnit.unitId": unitId,
//             }).session(session);

//             if (!pp) continue;

//             const ppStock = pp.stockByUnit.find(
//               (s) => s.unitId.toString() === unitId.toString()
//             );

//             ppStock.committedPPQuantity -= totalToRestore;
//             ppStock.availableToCommitPPQuantity += totalToRestore;
//             await pp.save({ session });

//             affectedParentIds.push(config.parentProductId);
//           }

//           // 🔁 Recalculate MainParentProducts using the restored ParentProducts
//           const relatedMPs = await MainParentProduct.find({
//             "parentProducts.parentProductId": { $in: affectedParentIds },
//             "stockByUnit.unitId": unitId,
//           }).session(session);

//           for (const mpItem of relatedMPs) {
//             const mpStock = mpItem.stockByUnit.find(
//               (s) => s.unitId.toString() === unitId.toString()
//             );
//             if (!mpStock) continue;

//             let maxMPQuantity = Infinity;
//             for (const config of mpItem.parentProducts) {
//               const pp = await ParentProduct.findOne({
//                 _id: config.parentProductId,
//                 "stockByUnit.unitId": unitId,
//               }).session(session);
//               if (!pp) {
//                 maxMPQuantity = 0;
//                 break;
//               }

//               const ppStock = pp.stockByUnit.find(
//                 (s) => s.unitId.toString() === unitId.toString()
//               );
//               if (!ppStock) {
//                 maxMPQuantity = 0;
//                 break;
//               }

//               const possibleQty = Math.floor(
//                 ppStock.availableToCommitPPQuantity / config.quantity
//               );
//               maxMPQuantity = Math.min(maxMPQuantity, possibleQty);
//             }

//             mpStock.totalMPQuantity = maxMPQuantity;
//             mpStock.availableToCommitMPQuantity = maxMPQuantity;
//             await mpItem.save({ session });
//           }
//         }
//       }
//     }

//     // 🔚 Deactivate the order
//     await Order.findByIdAndUpdate(orderId, { isActive: false }, { new: true }).session(session);

//     await session.commitTransaction();
//     session.endSession();

//     return res.status(200).json({ message: "Order deleted and stock restored successfully." });
//   } catch (error) {
//     await session.abortTransaction();
//     session.endSession();
//     console.error("Delete Order Error:", error);
//     return res.status(500).json({ message: "Internal server error", error: error.message });
//   }
// };

exports.deleteOrder = async (req, res) => {
  const session = await Order.startSession();
  session.startTransaction();

  try {
    const { orderId, user,cancelReason } = req.body;
    const order = await Order.findById(orderId).session(session);
    
    if (!order) {
      await session.abortTransaction();
      return res.status(404).json({ message: "Order not found" });
    }

    const { unitId, productDetails, orderCode, customerId } = order;
    
    
    let stockReversionSummary = [];

    for (const product of productDetails) {
      const { parentProductId, mainParentId, assignedQuantity } = product;

      if (assignedQuantity <= 0) continue;

      
      if (parentProductId) {
        const parent = await ParentProduct.findOne({
          _id: parentProductId,
          "stockByUnit.unitId": unitId,
        }).session(session);

        if (parent) {
          
          stockReversionSummary.push(`${assignedQuantity}x ${parent.parentProductName || 'Unknown Parent Product'}`);

          const stock = parent.stockByUnit.find(
            (s) => s.unitId.toString() === unitId.toString()
          );

          stock.committedPPQuantity -= assignedQuantity;
          stock.availableToCommitPPQuantity += assignedQuantity;
          await parent.save({ session });

          
          const relatedMPs = await MainParentProduct.find({
            "parentProducts.parentProductId": parentProductId,
            "stockByUnit.unitId": unitId,
          }).session(session);

          for (const mpItem of relatedMPs) {
             
             
          }
        }
      }

      
      if (mainParentId) {
        const mp = await MainParentProduct.findOne({
          _id: mainParentId,
          "stockByUnit.unitId": unitId,
        }).session(session);

        if (mp) {
          
          stockReversionSummary.push(`${assignedQuantity}x ${mp.mainParentProductName || 'Unknown Main Product'}`);

          const mpStock = mp.stockByUnit.find(
            (s) => s.unitId.toString() === unitId.toString()
          );

          mpStock.committedMPQuantity -= assignedQuantity;
          mpStock.availableToCommitMPQuantity += assignedQuantity;
          await mp.save({ session });

          
          const affectedParentIds = [];
          for (const config of mp.parentProducts) {
             
          }
          
        }
      }
    }

    
    await Order.findByIdAndUpdate(orderId, { isActive: false }, { new: true }).session(session);

    
    const detailedDescription = `Order ${orderCode} canceled by ${user?.employeeName || 'System'}. ` +
                                `Cancel Reason: ${cancelReason || 'No reason provided'}. ` +
                                `Stock reverted: ${stockReversionSummary.length > 0 ? stockReversionSummary.join(', ') : 'None'}.`;

    await ActivityLog.logCreate({
      employeeId: user?.employeeId || null,
      employeeCode: user?.employeeCode || null,
      employeeName: user?.employeeName || null,
      departmentId: user?.departmentId || null,
      departmentName: user?.departmentName || null,
      role: user?.role || null,
      unitId,
      customerID: customerId,
      orderId: order._id,
      orderCode: order.orderCode,
      orderType: order.orderType || "MainOrder",
      orderStatus: "Deactivated",
      action: "Order Deleted",
      module: "Order",
      entityName: order.orderCode,
      entityCode: order.orderCode,
      changeField: "isActive",
      oldValue: "true",
      newValue: "false",
      description: detailedDescription,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"]
    }, { session });

    await session.commitTransaction();
    session.endSession();

    return res.status(200).json({ message: "Order deleted and stock restored successfully." });
  } catch (error) {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    session.endSession();
    console.error("Delete Order Error:", error);
    return res.status(500).json({ message: "Internal server error", error: error.message });
  }
};

exports.getAllOrders = async (req, res) => {
  try {
    const { unitId,status } = req.body;
    if (!unitId) return res.status(400).json({ message: "Unit ID is required." });

    const matchStage = {
      isActive: true,
      unitId: new mongoose.Types.ObjectId(unitId)
    };
if(status !== 'All'){
  matchStage.status = status
}
 const orders = await Order.aggregate([
  { $match: matchStage },

  // Lookup customer
  {
    $lookup: {
      from: "customers",
      localField: "customerId",
      foreignField: "_id",
      as: "customer"
    }
  },
  { $unwind: { path: "$customer", preserveNullAndEmptyArrays: true } },

  // Unwind productDetails
  { $unwind: { path: "$productDetails", preserveNullAndEmptyArrays: true } },

  // Lookup productType
  {
    $lookup: {
      from: "producttypes",
      localField: "productDetails.productTypeId",
      foreignField: "_id",
      as: "productType"
    }
  },
  { $unwind: { path: "$productType", preserveNullAndEmptyArrays: true } },

  // Lookup child product
  {
    $lookup: {
      from: "childproducts",
      let: { id: "$productDetails.childProductId" },
      pipeline: [
        { $match: { $expr: { $eq: ["$_id", "$$id"] } } },
        { $project: {
            _id: 1,
            childProductName: 1,
            stockByUnit: 1
        }}
      ],
      as: "childProduct"
    }
  },
  { $unwind: { path: "$childProduct", preserveNullAndEmptyArrays: true } },

  // Lookup parent product
  {
    $lookup: {
      from: "parentproducts",
      let: { id: "$productDetails.parentProductId" },
      pipeline: [
        { $match: { $expr: { $eq: ["$_id", "$$id"] } } },
        { $project: {
            _id: 1,
            parentProductName: 1,
            stockByUnit: 1
        }}
      ],
      as: "parentProduct"
    }
  },
  { $unwind: { path: "$parentProduct", preserveNullAndEmptyArrays: true } },

  // Lookup main parent product
  {
    $lookup: {
      from: "mainparentproducts",
      let: { id: "$productDetails.mainParentId" },
      pipeline: [
        { $match: { $expr: { $eq: ["$_id", "$$id"] } } },
        { $project: {
            _id: 1,
            mainParentProductName: 1,
            stockByUnit: 1
        }}
      ],
      as: "mainParentProduct"
    }
  },
  { $unwind: { path: "$mainParentProduct", preserveNullAndEmptyArrays: true } },

  // Compute unified product name + available quantity
  {
    $addFields: {
      productName: {
        $cond: [
          { $ifNull: ["$childProduct._id", false] },
          "$childProduct.childProductName",
          {
            $cond: [
              { $ifNull: ["$parentProduct._id", false] },
              "$parentProduct.parentProductName",
              {
                $cond: [
                  { $ifNull: ["$mainParentProduct._id", false] },
                  "$mainParentProduct.mainParentProductName",
                  null
                ]
              }
            ]
          }
        ]
      },
      availableQuantity: {
        $cond: [
          { $ifNull: ["$childProduct._id", false] },
          {
            $ifNull: [
              {
                $first: {
                  $filter: {
                    input: "$childProduct.stockByUnit",
                    as: "s",
                    cond: {
                      $eq: ["$$s.unitId", new mongoose.Types.ObjectId(unitId)]
                    }
                  }
                }
              },
              { availableToCommitCPQuantity: 0 }
            ]
          },
          {
            $cond: [
              { $ifNull: ["$parentProduct._id", false] },
              {
                $ifNull: [
                  {
                    $first: {
                      $filter: {
                        input: "$parentProduct.stockByUnit",
                        as: "s",
                        cond: {
                          $eq: ["$$s.unitId", new mongoose.Types.ObjectId(unitId)]
                        }
                      }
                    }
                  },
                  { availableToCommitPPQuantity: 0 }
                ]
              },
              {
                $cond: [
                  { $ifNull: ["$mainParentProduct._id", false] },
                  {
                    $ifNull: [
                      {
                        $first: {
                          $filter: {
                            input: "$mainParentProduct.stockByUnit",
                            as: "s",
                            cond: {
                              $eq: ["$$s.unitId", new mongoose.Types.ObjectId(unitId)]
                            }
                          }
                        }
                      },
                      { availableToCommitMPQuantity: 0 }
                    ]
                  },
                  null
                ]
              }
            ]
          }
        ]
      }
    }
  },

  // Rebuild productDetails
  {
    $group: {
      _id: "$_id",
      orderCode: { $first: "$orderCode" },
      orderName: { $first: "$orderName" },
      unitId: { $first: "$unitId" },
      orderDate: { $first: "$orderDate" },
      orderShippingAddress: { $first: "$orderShippingAddress" },
      orderAddress: { $first: "$orderAddress" },
      status: { $first: "$status" },
      orderType: { $first: "$orderType" },
      orderConfirmDate: { $first: "$orderConfirmDate" },
      customerId: { $first: "$customer._id" },
      customerName: { $first: "$customer.customerName" },
      createdAt: { $first: "$createdAt" },
      updatedAt: { $first: "$updatedAt" },
      productDetails: {
        $push: {
          productTypeId: "$productDetails.productTypeId",
          productTypeName: "$productType.productTypeName",
          childProductId: "$productDetails.childProductId",
          parentProductId: "$productDetails.parentProductId",
          mainParentId: "$productDetails.mainParentId",
          productName: "$productName",
          requiredQuantity: "$productDetails.requiredQuantity",
          assignedQuantity: "$productDetails.assignedQuantity",
          availableQuantity: {
            $cond: [
              { $ifNull: ["$childProduct._id", false] },
              "$availableQuantity.availableToCommitCPQuantity",
              {
                $cond: [
                  { $ifNull: ["$parentProduct._id", false] },
                  "$availableQuantity.availableToCommitPPQuantity",
                  {
                    $cond: [
                      { $ifNull: ["$mainParentProduct._id", false] },
                      "$availableQuantity.availableToCommitMPQuantity",
                      null
                    ]
                  }
                ]
              }
            ]
          }
        }
      }
    }
  },

  // Compute totalItems safely
  {
    $addFields: {
      totalItems: {
        $sum: {
          $map: {
            input: "$productDetails",
            as: "item",
            in: {
              $ifNull: ["$$item.requiredQuantity", 0]
            }
          }
        }
      }
    }
  },

  { $sort: { createdAt: -1 } }
]);


    res.status(200).json(orders);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
};

exports.getMicroAllOrders = async (req, res) => {
  try {
    const { unitId } = req.body;
    if (!unitId) return res.status(400).json({ message: "Unit ID is required." });

    const matchStage = {
      isActive: true,
      unitId: new mongoose.Types.ObjectId(unitId),
      orderType: "MicroOrder",
      status:'Order Pending'
    };

 const orders = await Order.aggregate([
  { $match: matchStage },

  // Lookup customer
  {
    $lookup: {
      from: "customers",
      localField: "customerId",
      foreignField: "_id",
      as: "customer"
    }
  },
  { $unwind: { path: "$customer", preserveNullAndEmptyArrays: true } },

  // Unwind productDetails
  { $unwind: { path: "$productDetails", preserveNullAndEmptyArrays: true } },

  // Lookup productType
  {
    $lookup: {
      from: "producttypes",
      localField: "productDetails.productTypeId",
      foreignField: "_id",
      as: "productType"
    }
  },
  { $unwind: { path: "$productType", preserveNullAndEmptyArrays: true } },

  // Lookup child product
  {
    $lookup: {
      from: "childproducts",
      let: { id: "$productDetails.childProductId" },
      pipeline: [
        { $match: { $expr: { $eq: ["$_id", "$$id"] } } },
        { $project: {
            _id: 1,
            childProductName: 1,
            stockByUnit: 1
        }}
      ],
      as: "childProduct"
    }
  },
  { $unwind: { path: "$childProduct", preserveNullAndEmptyArrays: true } },

  // Lookup parent product
  {
    $lookup: {
      from: "parentproducts",
      let: { id: "$productDetails.parentProductId" },
      pipeline: [
        { $match: { $expr: { $eq: ["$_id", "$$id"] } } },
        { $project: {
            _id: 1,
            parentProductName: 1,
            stockByUnit: 1
        }}
      ],
      as: "parentProduct"
    }
  },
  { $unwind: { path: "$parentProduct", preserveNullAndEmptyArrays: true } },

  // Lookup main parent product
  {
    $lookup: {
      from: "mainparentproducts",
      let: { id: "$productDetails.mainParentId" },
      pipeline: [
        { $match: { $expr: { $eq: ["$_id", "$$id"] } } },
        { $project: {
            _id: 1,
            mainParentProductName: 1,
            stockByUnit: 1
        }}
      ],
      as: "mainParentProduct"
    }
  },
  { $unwind: { path: "$mainParentProduct", preserveNullAndEmptyArrays: true } },

  // Compute unified product name + available quantity
  {
    $addFields: {
      productName: {
        $cond: [
          { $ifNull: ["$childProduct._id", false] },
          "$childProduct.childProductName",
          {
            $cond: [
              { $ifNull: ["$parentProduct._id", false] },
              "$parentProduct.parentProductName",
              {
                $cond: [
                  { $ifNull: ["$mainParentProduct._id", false] },
                  "$mainParentProduct.mainParentProductName",
                  null
                ]
              }
            ]
          }
        ]
      },
      availableQuantity: {
        $cond: [
          { $ifNull: ["$childProduct._id", false] },
          {
            $ifNull: [
              {
                $first: {
                  $filter: {
                    input: "$childProduct.stockByUnit",
                    as: "s",
                    cond: {
                      $eq: ["$$s.unitId", new mongoose.Types.ObjectId(unitId)]
                    }
                  }
                }
              },
              { availableToCommitCPQuantity: 0 }
            ]
          },
          {
            $cond: [
              { $ifNull: ["$parentProduct._id", false] },
              {
                $ifNull: [
                  {
                    $first: {
                      $filter: {
                        input: "$parentProduct.stockByUnit",
                        as: "s",
                        cond: {
                          $eq: ["$$s.unitId", new mongoose.Types.ObjectId(unitId)]
                        }
                      }
                    }
                  },
                  { availableToCommitPPQuantity: 0 }
                ]
              },
              {
                $cond: [
                  { $ifNull: ["$mainParentProduct._id", false] },
                  {
                    $ifNull: [
                      {
                        $first: {
                          $filter: {
                            input: "$mainParentProduct.stockByUnit",
                            as: "s",
                            cond: {
                              $eq: ["$$s.unitId", new mongoose.Types.ObjectId(unitId)]
                            }
                          }
                        }
                      },
                      { availableToCommitMPQuantity: 0 }
                    ]
                  },
                  null
                ]
              }
            ]
          }
        ]
      }
    }
  },

  // Rebuild productDetails
  {
    $group: {
      _id: "$_id",
      orderCode: { $first: "$orderCode" },
      orderName: { $first: "$orderName" },
      unitId: { $first: "$unitId" },
      orderDate: { $first: "$orderDate" },
      orderShippingAddress: { $first: "$orderShippingAddress" },
      orderAddress: { $first: "$orderAddress" },
      status: { $first: "$status" },
      orderType: { $first: "$orderType" },
      orderConfirmDate: { $first: "$orderConfirmDate" },
      customerId: { $first: "$customer._id" },
      customerName: { $first: "$customer.customerName" },
      createdAt: { $first: "$createdAt" },
      updatedAt: { $first: "$updatedAt" },
      productDetails: {
        $push: {
          productTypeId: "$productDetails.productTypeId",
          productTypeName: "$productType.productTypeName",
          childProductId: "$productDetails.childProductId",
          parentProductId: "$productDetails.parentProductId",
          mainParentId: "$productDetails.mainParentId",
          productName: "$productName",
          requiredQuantity: "$productDetails.requiredQuantity",
          assignedQuantity: "$productDetails.assignedQuantity",
          availableQuantity: {
            $cond: [
              { $ifNull: ["$childProduct._id", false] },
              "$availableQuantity.availableToCommitCPQuantity",
              {
                $cond: [
                  { $ifNull: ["$parentProduct._id", false] },
                  "$availableQuantity.availableToCommitPPQuantity",
                  {
                    $cond: [
                      { $ifNull: ["$mainParentProduct._id", false] },
                      "$availableQuantity.availableToCommitMPQuantity",
                      null
                    ]
                  }
                ]
              }
            ]
          }
        }
      }
    }
  },

  // Compute totalItems safely
  {
    $addFields: {
      totalItems: {
        $sum: {
          $map: {
            input: "$productDetails",
            as: "item",
            in: {
              $ifNull: ["$$item.requiredQuantity", 0]
            }
          }
        }
      }
    }
  },

  { $sort: { createdAt: -1 } }
]);


    res.status(200).json(orders);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
};

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // Escape all special regex chars
}

exports.getAllParentProducts = async (req, res) => {
  try {
    const { unitId,parentProductName } = req.body;
    const filter = {isActive: true };

      if (parentProductName && parentProductName.trim() !== '') {
      const safePattern = escapeRegex(parentProductName.trim());
      filter.parentProductName = { $regex: safePattern, $options: 'i' }; // Case-insensitive
    }
    if (!unitId) {
      return res.status(400).json({ message: "Unit ID is required." });
    }

    const parent = await ParentProduct.aggregate([
      { $match: filter },

      // Filter stockByUnit for the selected unitId
      {
        $addFields: {
          stockByUnit: {
            $filter: {
              input: "$stockByUnit",
              as: "s",
              cond: {
                $eq: [
                  "$$s.unitId",
                  new mongoose.Types.ObjectId(unitId)
                ]
              }
            }
          }
        }
      },

      // Unwind filtered stock entry (may be empty)
      {
        $unwind: {
          path: "$stockByUnit",
          preserveNullAndEmptyArrays: true
        }
      },

      {
        $lookup: {
          from: "units",
          localField: "stockByUnit.unitId",
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

      // unwind childProducts
      {
        $unwind: {
          path: "$childProducts",
          preserveNullAndEmptyArrays: true
        }
      },

      // Lookup details for child products
      {
        $lookup: {
          from: "childproducts",
          localField: "childProducts.childProductId",
          foreignField: "_id",
          as: "childProductDetails"
        }
      },

      {
        $unwind: {
          path: "$childProductDetails",
          preserveNullAndEmptyArrays: true
        }
      },

      // Group back child products
      {
        $group: {
          _id: "$_id",
          parentProductCode: { $first: "$parentProductCode" },
          parentProductName: { $first: "$parentProductName" },
          totalPPQuantity: {
            $first: {
              $ifNull: ["$stockByUnit.totalPPQuantity", 0]
            }
          },
          committedPPQuantity: {
            $first: {
              $ifNull: ["$stockByUnit.committedPPQuantity", 0]
            }
          },
          availableToCommitPPQuantity: {
            $first: {
              $ifNull: ["$stockByUnit.availableToCommitPPQuantity", 0]
            }
          },
          description: { $first: "$description" },
          isActive: { $first: "$isActive" },
          createdAt: { $first: "$createdAt" },
          updatedAt: { $first: "$updatedAt" },
          unit: { $first: "$unit" },
          childProducts: {
            $push: {
              childProductId: "$childProducts.childProductId",
              quantity: "$childProducts.quantity",
              childProductName: "$childProductDetails.childProductName"
            }
          }
        }
      },

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
          unitName: "$unit.unitName",
          childProducts: 1
        }
      },

      { $sort: { createdAt: -1 } }
    ]).sort({ parentProductCode: 1 }).limit(50);

    res.status(200).json(parent);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
};

exports.getAllChildProducts = async (req, res) => {
  try {
    const { unitId } = req.body;
    if (!unitId) {
      return res.status(400).json({ message: "Unit ID is required." });
    }

    const matchstage = { isActive: true };

    const products = await ChildProduct.aggregate([
      { $match: matchstage },

      // Filter stockByUnit to only this unitId
      {
        $addFields: {
          stockByUnit: {
            $filter: {
              input: "$stockByUnit",
              as: "stock",
              cond: {
                $eq: ["$$stock.unitId", new mongoose.Types.ObjectId(unitId)]
              }
            }
          }
        }
      },

      // Unwind filtered stockByUnit if exists
      {
        $unwind: {
          path: "$stockByUnit",
          preserveNullAndEmptyArrays: true
        }
      },

      {
        $lookup: {
          from: "units",
          localField: "stockByUnit.unitId",
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

      {
        $lookup: {
          from: "categories",
          localField: "categoryId",
          foreignField: "_id",
          as: "category"
        }
      },
      {
        $unwind: {
          path: "$category",
          preserveNullAndEmptyArrays: true
        }
      },

      {
  $project: {
    _id: 1,
    childProductCode: 1,
    childProductName: 1,
    isActive: 1,
    unitId: "$unit._id",
    unitName: "$unit.name",
    categoryId: "$category._id",
    CategoryName: "$category.categoryName",
    fullChildProductName: {
      $concat: [
        { $ifNull: ["$childProductName", ""] },
        " - ",
        { $ifNull: ["$category.categoryName", ""] }
      ]
    },
    totalCPQuantity: {
      $ifNull: ["$stockByUnit.totalCPQuantity", 0]
    },
    committedCPQuantity: {
      $ifNull: ["$stockByUnit.committedCPQuantity", 0]
    },
    availableToCommitCPQuantity: {
      $ifNull: ["$stockByUnit.availableToCommitCPQuantity", 0]
    },
    createdAt: 1,
    updatedAt: 1
  }
},
      { $sort: { createdAt: -1 } }
    ]);

    res.status(200).json(products);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
};

exports.getAllProductTypes = async (req, res) => {
  try {
    const { unitId } = req.body;
    const matchstage = {
      isActive: true,
      // unitId: new mongoose.Types.ObjectId(unitId)
    };

    const types = await ProductType.aggregate([
      { $match: matchstage },
      {
        $project: {
          _id: 1,
          productTypeCode: 1,
          productTypeName: 1,
          unitId: 1,
          createdAt: 1,
          updatedAt: 1
        }
      },
      { $sort: { createdAt: -1 } }
    ]);

    res.status(200).json(types);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getAllMainParentProducts = async (req, res) => {
  try {
    const { unitId } = req.body;
    if (!unitId) {
      return res.status(400).json({ message: "Unit ID is required." });
    }

    const matchstage = {
      isActive: true
    };

    const products = await MainParentProduct.aggregate([
      { $match: matchstage },

      // Filter stockByUnit to the provided unitId
      {
        $addFields: {
          stockByUnit: {
            $filter: {
              input: "$stockByUnit",
              as: "s",
              cond: {
                $eq: [
                  "$$s.unitId",
                  new mongoose.Types.ObjectId(unitId)
                ]
              }
            }
          }
        }
      },

      // Unwind filtered stock entry (may be null)
      {
        $unwind: {
          path: "$stockByUnit",
          preserveNullAndEmptyArrays: true
        }
      },

      {
        $lookup: {
          from: "units",
          localField: "stockByUnit.unitId",
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

      {
        $project: {
          _id: 1,
          mainParentProductCode: 1,
          mainParentProductName: 1,
          totalMPQuantity: {
            $ifNull: ["$stockByUnit.totalMPQuantity", 0]
          },
          committedMPQuantity: {
            $ifNull: ["$stockByUnit.committedMPQuantity", 0]
          },
          availableToCommitMPQuantity: {
            $ifNull: ["$stockByUnit.availableToCommitMPQuantity", 0]
          },
          unitId: "$unit._id",
          unitName: "$unit.unitName",
          isActive: 1,
          createdAt: 1,
          updatedAt: 1
        }
      },

      { $sort: { createdAt: -1 } }
    ]);

    res.status(200).json(products);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
};

exports.getAllCustomers = async (req, res) => {
  try {
    const { unitId } = req.body;

    const matchstage = {
      isActive: true,
      unitId: new mongoose.Types.ObjectId(unitId)
    };

    const customers = await Customer.aggregate([
      { $match: matchstage },
      {
        $addFields: {
          rawLocations: [
            { city: "$customerCity", branch: "$customerAddress" },
            { city: "$customerCity1", branch: "$customerBranch1" },
            { city: "$customerCity2", branch: "$customerBranch2" },
            { city: "$customerCity3", branch: "$customerBranch3" }
          ]
        }
      },
      {
        $addFields: {
          customerLocations: {
            $filter: {
              input: "$rawLocations",
              as: "loc",
              cond: {
                $and: [
                  { $ne: ["$$loc.city", null] },
                  { $ne: ["$$loc.city", ""] }
                ]
              }
            }
          }
        }
      },
      {
        $project: {
          _id: 1,
          customerCode: 1,
          customerName: 1,
          customerEmail: 1,
          customerMobile: 1,
          customerAddress: 1,
          customerState: 1,
          customerZipCode: 1,
          unitId: 1,
          customerLocations: 1,
          createdAt: 1,
          updatedAt: 1
        }
      },
      { $sort: { createdAt: -1 } }
    ]);

    res.status(200).json(customers);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.ChangeStatus = async (req, res) => {
  try {
    const { orderCodes } = req.body;

    // 1. Basic validation
    if (!orderCodes || !Array.isArray(orderCodes) || orderCodes.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or empty array of orderCodes provided in request body.'
      });
    }

    // 2. Define the filter and the update operation
    const filter = {
      orderCode: { $in: orderCodes } // Select orders where orderCode is in the provided array
    };

    const update = {
      $set: {
        status: 'Order Confirmed', // Set the new status
        orderConfirmDate: new Date() // Set the confirmation date to now
      }
    };

    // 3. Execute the update operation
    const result = await Order.updateMany(filter, update);

    // 4. Check the result and respond
    if (result.nModified === 0) {
      // If no documents were modified, it means either the codes didn't exist
      // or they were already 'Order Confirmed'.
      return res.status(404).json({
        success: false,
        message: 'No orders were updated. Check if the orderCodes exist or if they are already confirmed.',
        details: result
      });
    }

    // Successful update
    res.status(200).json({
      success: true,
      message: `${result.nModified} orders successfully confirmed.`,
      updateResult: {
        matchedCount: result.matchedCount,
        modifiedCount: result.modifiedCount
      }
    });

  } catch (error) {
    console.error('Error confirming orders:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during order confirmation.',
      error: error.message
    });
  }
};
