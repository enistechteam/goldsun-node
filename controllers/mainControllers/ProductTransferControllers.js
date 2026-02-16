const mongoose = require("mongoose");
const ProductOutward = require("../../models/masterModels/ProductOutwards");
const ProductInward = require("../../models/masterModels/ProductInwards");
const ChildProduct = require("../../models/masterModels/ChildProduct");
const ParentProduct = require("../../models/masterModels/ParentProduct");
const MainParentProduct = require("../../models/masterModels/MainParent");
const Unit = require('../../models/masterModels/Unit')
const ActivityLog = require("../mainControllers/ActivityLogControllers");
const Logs = require("../../models/masterModels/Log");

// exports.createProductOutward = async (req, res) => {
//   const session = await mongoose.startSession();
//  // console.log('🔷 ===== PRODUCT OUTWARD TRANSACTION STARTED =====');
//  // console.log('🕐 Start Time:', new Date().toISOString());
  
//   try {
//     await session.withTransaction(async () => {
//       const { fromUnitId, toUnitId, products, user } = req.body;
//      // console.log('📦 Request Data:', {
//       //   fromUnitId,
//       //   toUnitId,
//       //   productCount: products?.length,
//       //   user: user?.employeeName || 'Unknown'
//       // });
      
//       // Validate required fields
//       if (!fromUnitId || !toUnitId || !products || !Array.isArray(products) || products.length === 0) {
//         console.error('❌ Validation Error: Missing required fields');
//         throw new Error('Missing required fields: fromUnitId, toUnitId, or products');
//       }

//       if (fromUnitId.toString() === toUnitId.toString()) {
//         console.error('❌ Validation Error: Same unit for from and to');
//         throw new Error('From unit and to unit cannot be the same');
//       }
      
//      // console.log('✅ Basic validation passed');
      
//       // Fetch unit names within transaction
//      // console.log('🔍 Fetching unit details...');
//       const [FromUnitName, ToUnitName] = await Promise.all([
//         Unit.findOne({ _id: fromUnitId }).session(session),
//         Unit.findOne({ _id: toUnitId }).session(session)
//       ]);
      
//       if (!FromUnitName || !ToUnitName) {
//         console.error('❌ Unit fetch failed:', { FromUnitName: !!FromUnitName, ToUnitName: !!ToUnitName });
//         throw new Error('Invalid unit IDs provided');
//       }
//      // console.log('✅ Units found:', { from: FromUnitName.UnitName, to: ToUnitName.UnitName });

//       // Generate codes in parallel
//      // console.log('🔢 Generating outward and inward codes...');
//       const [lastOutward, lastInward] = await Promise.all([
//         ProductOutward.findOne({ outwardCode: { $regex: /^OUTW\d{7}$/ } })
//           .sort({ outwardCode: -1 })
//           .collation({ locale: 'en', numericOrdering: true })
//           .session(session),
//         ProductInward.findOne({ inwardCode: { $regex: /^INWD\d{7}$/ } })
//           .sort({ inwardCode: -1 })
//           .collation({ locale: 'en', numericOrdering: true })
//           .session(session)
//       ]);

//       let outwardCode = 'OUTW0000001';
//       if (lastOutward?.outwardCode) {
//         const numericPart = parseInt(lastOutward.outwardCode.slice(4));
//         outwardCode = `OUTW${(numericPart + 1).toString().padStart(7, '0')}`;
//       }

//       let inwardCode = 'INWD0000001';
//       if (lastInward?.inwardCode) {
//         const numericPart = parseInt(lastInward.inwardCode.slice(4));
//         inwardCode = `INWD${(numericPart + 1).toString().padStart(7, '0')}`;
//       }
//      // console.log('✅ Codes generated:', { outwardCode, inwardCode });

//       const outwardDetails = [];
//       const inwardDetails = [];
//       const affectedUnits = new Set([fromUnitId.toString(), toUnitId.toString()]);

//       // ==============================================
//       // HELPER FUNCTION: Recalculate MainParent Stock
//       // ==============================================
//       const recalculateMainParentStock = async (affectedParentIds, unitIds) => {
//         if (affectedParentIds.size === 0) {
//          // console.log('ℹ️ No parent products affected, skipping recalculation');
//           return;
//         }

//        // console.log('\n🔄 Starting MainParent Recalculation...');
//        // console.log('Affected Parent IDs:', Array.from(affectedParentIds));
//        // console.log('Affected Units:', Array.from(unitIds));

//         for (const unitId of unitIds) {
//          // console.log(`\n  → Recalculating for unit: ${unitId}`);
          
//           // Find all MainParents that depend on these ParentProducts
//           const mainParents = await MainParentProduct.find({ 
//             'parentProducts.parentProductId': { $in: Array.from(affectedParentIds) }
//           }).session(session);
          
//          // console.log(`  Found ${mainParents.length} main parents to recalculate`);

//           if (mainParents.length === 0) continue;

//           // Fetch all required parent products for recalculation
//           const allParentIdsForRecalc = new Set();
//           mainParents.forEach(mp => {
//             mp.parentProducts.forEach(pp => allParentIdsForRecalc.add(pp.parentProductId.toString()));
//           });

//           const parentsForRecalc = await ParentProduct.find({
//             _id: { $in: Array.from(allParentIdsForRecalc) }
//           }).session(session);

//           const parentRecalcMap = new Map(parentsForRecalc.map(p => [p._id.toString(), p]));

//           // Recalculate each MainParent
//           for (const mainParent of mainParents) {
//            // console.log(`    → Recalculating: ${mainParent.mainParentProductName}`);
            
//             let minBuildable = Infinity;

//             // Calculate minimum buildable quantity based on all required parents
//             for (const { parentProductId, quantity } of mainParent.parentProducts) {
//               const ppDoc = parentRecalcMap.get(parentProductId.toString());
//               if (!ppDoc) {
//                 throw new Error(`Parent product not found during recalculation: ${parentProductId}`);
//               }
              
//               const ppStock = ppDoc.stockByUnit.find(s => s.unitId.toString() === unitId.toString());
//               const available = ppStock?.availableToCommitPPQuantity || 0;
//               const possibleQuantity = Math.floor(available / quantity);
              
//              // console.log(`      PP ${ppDoc.parentProductName}: available=${available}, required per MP=${quantity}, possible MP qty=${possibleQuantity}`);
//               minBuildable = Math.min(minBuildable, possibleQuantity);
//             }

//             const calculatedStock = minBuildable === Infinity ? 0 : minBuildable;
//            // console.log(`    ✅ Calculated available MP stock: ${calculatedStock}`);

//             // Update MainParent stock
//             let mpStock = mainParent.stockByUnit.find(s => s.unitId.toString() === unitId.toString());
            
//             if (!mpStock) {
//              // console.log('    Creating new MP stock entry');
//               mainParent.stockByUnit.push({
//                 unitId: new mongoose.Types.ObjectId(unitId),
//                 totalMPQuantity: calculatedStock,
//                 availableToCommitMPQuantity: calculatedStock,
//                 committedMPQuantity: 0
//               });
//             } else {
//               const oldStock = mpStock.availableToCommitMPQuantity;
//               mpStock.totalMPQuantity = calculatedStock;
//               mpStock.availableToCommitMPQuantity = calculatedStock;
//              // console.log(`    Updated MP stock: ${oldStock} → ${calculatedStock}`);
//             }
            
//             await mainParent.save({ session });
//           }
//         }
//        // console.log('✅ MainParent recalculation completed\n');
//       };

//       // ==============================================
//       // SEQUENTIAL PRODUCT PROCESSING
//       // ==============================================
//      // console.log('\n⚙️ Starting Sequential Product Processing...\n');

//       for (let index = 0; index < products.length; index++) {
//         const item = products[index];
//        // console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
//        // console.log(`📦 Processing Product ${index + 1}/${products.length}`);
//        // console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

//         let { 
//           productType,
//           childProductId,
//           parentProductId,
//           mainParentId,
//           quantity,
//           productTypeId
//         } = item;

//         quantity = Number(quantity);
//         if (isNaN(quantity) || quantity <= 0) {
//           throw new Error(`Invalid quantity: ${item.quantity} for product ${index + 1}`);
//         }

//        // console.log('Product Details:', { type: productType, quantity });

//         // Track affected parent products for recalculation
//         const affectedParentIdsThisProduct = new Set();

//         // ==============================================
//         // CASE 1: PARENT PRODUCT OUTWARD
//         // ==============================================
//         if (productType === 'Parent Product') {
//          // console.log('\n📍 Processing PARENT PRODUCT outward');
          
//           // Fetch the latest parent product data
//           const parentDoc = await ParentProduct.findById(parentProductId).session(session);
//           if (!parentDoc) {
//             throw new Error(`Parent product not found: ${parentProductId}`);
//           }
//          // console.log('✅ Parent Product:', parentDoc.parentProductName);

//           // Check FROM unit stock
//           const fromStock = parentDoc.stockByUnit.find(s => s.unitId.toString() === fromUnitId.toString());
//           if (!fromStock) {
//             throw new Error(`No stock found for ${parentDoc.parentProductName} in ${FromUnitName.UnitName}`);
//           }

//          // console.log('FROM stock:', { available: fromStock.availableToCommitPPQuantity, required: quantity });

//           if (fromStock.availableToCommitPPQuantity < quantity) {
//             throw new Error(`Insufficient stock for ${parentDoc.parentProductName}. Available: ${fromStock.availableToCommitPPQuantity}, Required: ${quantity}`);
//           }

//           const fromOldQuantity = fromStock.availableToCommitPPQuantity;
//           fromStock.totalPPQuantity -= quantity;
//           fromStock.availableToCommitPPQuantity -= quantity;
//           const fromNewQuantity = fromStock.availableToCommitPPQuantity;

//           // Check and update TO unit stock
//           let toStock = parentDoc.stockByUnit.find(s => s.unitId.toString() === toUnitId.toString());
//           let toOldQuantity = 0;
          
//           if (!toStock) {
//             toOldQuantity = 0;
//             const newStockEntry = {
//               unitId: new mongoose.Types.ObjectId(toUnitId),
//               totalPPQuantity: quantity,
//               availableToCommitPPQuantity: quantity,
//               committedPPQuantity: 0
//             };
//             parentDoc.stockByUnit.push(newStockEntry);
//             toStock = newStockEntry; // ✅ FIX: Assign reference to new entry
//           } else {
//             toOldQuantity = toStock.availableToCommitPPQuantity;
//             toStock.totalPPQuantity += quantity;
//             toStock.availableToCommitPPQuantity += quantity;
//           }
//           const toNewQuantity = toStock.availableToCommitPPQuantity;

//          // console.log('✅ Stock updated - FROM:', { old: fromOldQuantity, new: fromNewQuantity });
//          // console.log('✅ Stock updated - TO:', { old: toOldQuantity, new: toNewQuantity });

//           // Save parent product
//           await parentDoc.save({ session });
//          // console.log('💾 Parent product saved');

//           // Add to affected parents for recalculation
//           affectedParentIdsThisProduct.add(parentProductId.toString());

//           // Add to details arrays
//           const detailItem = {
//             productTypeId,
//             childProductId: null,
//             parentProductId,
//             mainParentId: null,
//             quantity,
//             fromOldQuantity,
//             fromNewQuantity,
//             toOldQuantity,
//             toNewQuantity
//           };
//           outwardDetails.push(detailItem);
//           inwardDetails.push({ ...detailItem });

//           // Create Activity Logs
//           await ActivityLog.logCreate({
//             employeeId: user?.employeeId || null,
//             employeeCode: user?.employeeCode || null,
//             employeeName: user?.employeeName || null,
//             departmentId: user?.departmentId || null,
//             departmentName: user?.departmentName || null,
//             role: user?.role || null,
//             unitId: fromUnitId,
//             unitName: user?.unitName || null,
//             childProductId: null,
//             parentProductId,
//             mainParentId: null,
//             orderId: null,
//             orderCode: outwardCode,
//             orderType: "ProductOutward",
//             orderStatus: null,
//             action: "Outwards",
//             module: "Product Outward",
//             entityName: `Parent Product-${parentDoc.parentProductName}`,
//             entityCode: outwardCode,
//             changeField: 'availableToCommitPPQuantity',
//             oldValue: fromOldQuantity,
//             activityValue: quantity,
//             newValue: fromNewQuantity,
//             description: `Outwarded ${quantity} Quantities of ${parentDoc.parentProductName} from ${FromUnitName.UnitName} to ${ToUnitName.UnitName}, current Stock in ${FromUnitName.UnitName} - ${fromNewQuantity}, current stock in ${ToUnitName.UnitName} - ${toNewQuantity} `,
//             ipAddress: req.ip,
//             userAgent: req.headers["user-agent"]
//           }, { session });

//           await ActivityLog.logCreate({
//             employeeId: user?.employeeId || null,
//             employeeCode: user?.employeeCode || null,
//             employeeName: user?.employeeName || null,
//             departmentId: user?.departmentId || null,
//             departmentName: user?.departmentName || null,
//             role: user?.role || null,
//             unitId: toUnitId,
//             unitName: user?.unitName || null,
//             childProductId: null,
//             parentProductId,
//             mainParentId: null,
//             orderId: null,
//             orderCode: inwardCode,
//             orderType: "ProductInward",
//             orderStatus: null,
//             action: "Inwards",
//             module: "Product Inward",
//             entityName: `Parent Product-${parentDoc.parentProductName}`,
//             entityCode: inwardCode,
//             changeField: 'availableToCommitPPQuantity',
//             oldValue: toOldQuantity,
//             activityValue: quantity,
//             newValue: toNewQuantity,
//             description: `Inwarded ${quantity} Quantities of ${parentDoc.parentProductName} from ${FromUnitName.UnitName} to ${ToUnitName.UnitName}, current Stock in ${FromUnitName.UnitName} - ${fromNewQuantity}, current stock in ${ToUnitName.UnitName} - ${toNewQuantity}`,
//             ipAddress: req.ip,
//             userAgent: req.headers["user-agent"]
//           }, { session });

//          // console.log('📝 Activity logs created');

//           // IMMEDIATE RECALCULATION after Parent Product outward
//          // console.log('\n🔄 Recalculating dependent MainParents after PP outward...');
//           await recalculateMainParentStock(affectedParentIdsThisProduct, affectedUnits);
//         }
        
//         // ==============================================
//         // CASE 2: MAIN PARENT PRODUCT OUTWARD
//         // ==============================================
//         else if (productType === 'Main Parent') {
//          // console.log('\n📍 Processing MAIN PARENT PRODUCT outward');
          
//           // Fetch the LATEST main parent product data (after previous recalculations)
//           const mainParentDoc = await MainParentProduct.findById(mainParentId).session(session);
//           if (!mainParentDoc) {
//             throw new Error(`Main parent product not found: ${mainParentId}`);
//           }
//          // console.log('✅ Main Parent Product:', mainParentDoc.mainParentProductName);

//           // Check FROM unit stock (LATEST after recalculation)
//           const fromStock = mainParentDoc.stockByUnit.find(s => s.unitId.toString() === fromUnitId.toString());
//           if (!fromStock) {
//             throw new Error(`No stock found for ${mainParentDoc.mainParentProductName} in ${FromUnitName.UnitName}`);
//           }

//          // console.log('FROM stock (LATEST):', { available: fromStock.availableToCommitMPQuantity, required: quantity });

//           if (fromStock.availableToCommitMPQuantity < quantity) {
//             throw new Error(`Insufficient stock for ${mainParentDoc.mainParentProductName}. Available: ${fromStock.availableToCommitMPQuantity}, Required: ${quantity}`);
//           }

//           const fromOldQuantity = fromStock.availableToCommitMPQuantity;
//           fromStock.totalMPQuantity -= quantity;
//           fromStock.availableToCommitMPQuantity -= quantity;
//           const fromNewQuantity = fromStock.availableToCommitMPQuantity;

//           // Check and update TO unit stock
//           let toStock = mainParentDoc.stockByUnit.find(s => s.unitId.toString() === toUnitId.toString());
//           let toOldQuantity = 0;
          
//           if (!toStock) {
//             toOldQuantity = 0;
//             const newStockEntry = {
//               unitId: new mongoose.Types.ObjectId(toUnitId),
//               totalMPQuantity: quantity,
//               availableToCommitMPQuantity: quantity,
//               committedMPQuantity: 0
//             };
//             mainParentDoc.stockByUnit.push(newStockEntry);
//             toStock = newStockEntry; // ✅ FIX: Assign reference to new entry
//           } else {
//             toOldQuantity = toStock.availableToCommitMPQuantity;
//             toStock.totalMPQuantity += quantity;
//             toStock.availableToCommitMPQuantity += quantity;
//           }
//           const toNewQuantity = toStock.availableToCommitMPQuantity;

//          // console.log('✅ MP Stock updated - FROM:', { old: fromOldQuantity, new: fromNewQuantity });
//          // console.log('✅ MP Stock updated - TO:', { old: toOldQuantity, new: toNewQuantity });

//           // Save main parent
//           await mainParentDoc.save({ session });
//          // console.log('💾 Main parent saved');

//           // Now cascade to parent products
//          // console.log('\n🔗 Cascading to Parent Products...');
          
//           // Fetch all required parent products
//           const parentProductIdsForMP = mainParentDoc.parentProducts.map(c => c.parentProductId);
//           const parentDocsForMP = await ParentProduct.find({ 
//             _id: { $in: parentProductIdsForMP } 
//           }).session(session);

//           const parentDocMap = new Map(parentDocsForMP.map(p => [p._id.toString(), p]));

//           for (const config of mainParentDoc.parentProducts) {
//             const parentDoc = parentDocMap.get(config.parentProductId.toString());
//             if (!parentDoc) {
//               throw new Error(`Parent product not found: ${config.parentProductId}`);
//             }

//             const requiredQuantity = quantity * config.quantity;
//            // console.log(`  → Cascading to ${parentDoc.parentProductName}, required: ${requiredQuantity}`);

//             // Update FROM unit parent stock
//             const fromParentStock = parentDoc.stockByUnit.find(s => s.unitId.toString() === fromUnitId.toString());
//             if (!fromParentStock) {
//               throw new Error(`No stock for ${parentDoc.parentProductName} in ${FromUnitName.UnitName}`);
//             }

//             if (fromParentStock.availableToCommitPPQuantity < requiredQuantity) {
//               throw new Error(`Insufficient parent stock. Parent: ${parentDoc.parentProductName}, Required: ${requiredQuantity}, Available: ${fromParentStock.availableToCommitPPQuantity}`);
//             }

//             fromParentStock.totalPPQuantity -= requiredQuantity;
//             fromParentStock.availableToCommitPPQuantity -= requiredQuantity;

//             // Update TO unit parent stock
//             let toParentStock = parentDoc.stockByUnit.find(s => s.unitId.toString() === toUnitId.toString());
            
//             if (!toParentStock) {
//               const newParentStockEntry = {
//                 unitId: new mongoose.Types.ObjectId(toUnitId),
//                 totalPPQuantity: requiredQuantity,
//                 availableToCommitPPQuantity: requiredQuantity,
//                 committedPPQuantity: 0
//               };
//               parentDoc.stockByUnit.push(newParentStockEntry);
//               toParentStock = newParentStockEntry; // ✅ FIX: Assign reference
//             } else {
//               toParentStock.totalPPQuantity += requiredQuantity;
//               toParentStock.availableToCommitPPQuantity += requiredQuantity;
//             }

//             await parentDoc.save({ session });
//             affectedParentIdsThisProduct.add(config.parentProductId.toString());
//            // console.log(`  ✅ ${parentDoc.parentProductName} updated`);
//           }

//           // Add to details arrays
//           const detailItem = {
//             productTypeId,
//             childProductId: null,
//             parentProductId: null,
//             mainParentId,
//             quantity,
//             fromOldQuantity,
//             fromNewQuantity,
//             toOldQuantity,
//             toNewQuantity
//           };
//           outwardDetails.push(detailItem);
//           inwardDetails.push({ ...detailItem });

//           // Create Activity Logs
//           await ActivityLog.logCreate({
//             employeeId: user?.employeeId || null,
//             employeeCode: user?.employeeCode || null,
//             employeeName: user?.employeeName || null,
//             departmentId: user?.departmentId || null,
//             departmentName: user?.departmentName || null,
//             role: user?.role || null,
//             unitId: fromUnitId,
//             unitName: user?.unitName || null,
//             childProductId: null,
//             parentProductId: null,
//             mainParentId,
//             orderId: null,
//             orderCode: outwardCode,
//             orderType: "ProductOutward",
//             orderStatus: null,
//             action: "Outwards",
//             module: "Product Outward",
//             entityName: `Main Parent-${mainParentDoc.mainParentProductName}`,
//             entityCode: outwardCode,
//             changeField: 'availableToCommitMPQuantity',
//             oldValue: fromOldQuantity,
//             activityValue: quantity,
//             newValue: fromNewQuantity,
//             description: `Outwarded ${quantity} units of ${mainParentDoc.mainParentProductName} from ${FromUnitName.UnitName} to ${ToUnitName.UnitName}, current Stock in ${FromUnitName.UnitName} - ${fromNewQuantity}, current stock in ${ToUnitName.UnitName} - ${toNewQuantity} `,
//             ipAddress: req.ip,
//             userAgent: req.headers["user-agent"]
//           }, { session });

//           await ActivityLog.logCreate({
//             employeeId: user?.employeeId || null,
//             employeeCode: user?.employeeCode || null,
//             employeeName: user?.employeeName || null,
//             departmentId: user?.departmentId || null,
//             departmentName: user?.departmentName || null,
//             role: user?.role || null,
//             unitId: toUnitId,
//             unitName: user?.unitName || null,
//             childProductId: null,
//             parentProductId: null,
//             mainParentId,
//             orderId: null,
//             orderCode: inwardCode,
//             orderType: "ProductInward",
//             orderStatus: null,
//             action: "Inwards",
//             module: "Product Inward",
//             entityName: `Main Parent-${mainParentDoc.mainParentProductName}`,
//             entityCode: inwardCode,
//             changeField: 'availableToCommitMPQuantity',
//             oldValue: toOldQuantity,
//             activityValue: quantity,
//             newValue: toNewQuantity,
//             description: `Inwarded ${quantity} units of ${mainParentDoc.mainParentProductName} from ${FromUnitName.UnitName} to ${ToUnitName.UnitName}, current Stock in ${FromUnitName.UnitName} - ${fromNewQuantity}, current stock in ${ToUnitName.UnitName} - ${toNewQuantity} `,
//             ipAddress: req.ip,
//             userAgent: req.headers["user-agent"]
//           }, { session });

//          // console.log('📝 Activity logs created');

//           // IMMEDIATE RECALCULATION after Main Parent outward
//          // console.log('\n🔄 Recalculating dependent MainParents after MP outward...');
//           await recalculateMainParentStock(affectedParentIdsThisProduct, affectedUnits);
//         }
        
//         // ==============================================
//         // CASE 3: CHILD PRODUCT OUTWARD
//         // ==============================================
//         else if (productType === 'Child Product') {
//          // console.log('\n📍 Processing CHILD PRODUCT outward');
          
//           const childDoc = await ChildProduct.findById(childProductId).session(session);
//           if (!childDoc) {
//             throw new Error(`Child product not found: ${childProductId}`);
//           }
//          // console.log('✅ Child Product:', childDoc.childProductName);

//           // Check FROM unit stock
//           const fromStock = childDoc.stockByUnit.find(s => s.unitId.toString() === fromUnitId.toString());
//           if (!fromStock) {
//             throw new Error(`No stock found for ${childDoc.childProductName} in ${FromUnitName.UnitName}`);
//           }

//          // console.log('FROM stock:', { available: fromStock.availableToCommitCPQuantity, required: quantity });

//           if (fromStock.availableToCommitCPQuantity < quantity) {
//             throw new Error(`Insufficient stock for ${childDoc.childProductName}. Available: ${fromStock.availableToCommitCPQuantity}, Required: ${quantity}`);
//           }

//           const fromOldQuantity = fromStock.availableToCommitCPQuantity;
//           fromStock.totalCPQuantity -= quantity;
//           fromStock.availableToCommitCPQuantity -= quantity;
//           const fromNewQuantity = fromStock.availableToCommitCPQuantity;

//           // Check and update TO unit stock
//           let toStock = childDoc.stockByUnit.find(s => s.unitId.toString() === toUnitId.toString());
//           let toOldQuantity = 0;
          
//           if (!toStock) {
//             toOldQuantity = 0;
//             const newStockEntry = {
//               unitId: new mongoose.Types.ObjectId(toUnitId),
//               totalCPQuantity: quantity,
//               availableToCommitCPQuantity: quantity,
//               committedCPQuantity: 0
//             };
//             childDoc.stockByUnit.push(newStockEntry);
//             toStock = newStockEntry; // ✅ FIX: Assign reference to new entry
//           } else {
//             toOldQuantity = toStock.availableToCommitCPQuantity;
//             toStock.totalCPQuantity += quantity;
//             toStock.availableToCommitCPQuantity += quantity;
//           }
//           const toNewQuantity = toStock.availableToCommitCPQuantity;

//          // console.log('✅ Stock updated - FROM:', { old: fromOldQuantity, new: fromNewQuantity });
//          // console.log('✅ Stock updated - TO:', { old: toOldQuantity, new: toNewQuantity });

//           // Save child product
//           await childDoc.save({ session });
//          // console.log('💾 Child product saved');

//           // Add to details arrays
//           const detailItem = {
//             productTypeId,
//             childProductId,
//             parentProductId: null,
//             mainParentId: null,
//             quantity,
//             fromOldQuantity,
//             fromNewQuantity,
//             toOldQuantity,
//             toNewQuantity
//           };
//           outwardDetails.push(detailItem);
//           inwardDetails.push({ ...detailItem });

//           // Create Activity Logs
//           await ActivityLog.logCreate({
//             employeeId: user?.employeeId || null,
//             employeeCode: user?.employeeCode || null,
//             employeeName: user?.employeeName || null,
//             departmentId: user?.departmentId || null,
//             departmentName: user?.departmentName || null,
//             role: user?.role || null,
//             unitId: fromUnitId,
//             unitName: user?.unitName || null,
//             childProductId,
//             parentProductId: null,
//             mainParentId: null,
//             orderId: null,
//             orderCode: outwardCode,
//             orderType: "ProductOutward",
//             orderStatus: null,
//             action: "Outwards",
//             module: "Product Outward",
//             entityName: `Child Product-${childDoc.childProductName}`,
//             entityCode: outwardCode,
//             changeField: 'availableToCommitCPQuantity',
//             oldValue: fromOldQuantity,
//             activityValue: quantity,
//             newValue: fromNewQuantity,
//             description: `Outwarded ${quantity} units of ${childDoc.childProductName} from ${FromUnitName.UnitName} to ${ToUnitName.UnitName}, current Stock in ${FromUnitName.UnitName} - ${fromNewQuantity}, current stock in ${ToUnitName.UnitName} - ${toNewQuantity} `,
//             ipAddress: req.ip,
//             userAgent: req.headers["user-agent"]
//           }, { session });

//           await ActivityLog.logCreate({
//             employeeId: user?.employeeId || null,
//             employeeCode: user?.employeeCode || null,
//             employeeName: user?.employeeName || null,
//             departmentId: user?.departmentId || null,
//             departmentName: user?.departmentName || null,
//             role: user?.role || null,
//             unitId: toUnitId,
//             unitName: user?.unitName || null,
//             childProductId,
//             parentProductId: null,
//             mainParentId: null,
//             orderId: null,
//             orderCode: inwardCode,
//             orderType: "ProductInward",
//             orderStatus: null,
//             action: "Inwards",
//             module: "Product Inward",
//             entityName: `Child Product-${childDoc.childProductName}`,
//             entityCode: inwardCode,
//             changeField: 'availableToCommitCPQuantity',
//             oldValue: toOldQuantity,
//             activityValue: quantity,
//             newValue: toNewQuantity,
//             description: `Inwarded ${quantity} units of ${childDoc.childProductName} from ${FromUnitName.UnitName} to ${ToUnitName.UnitName}, current Stock in ${FromUnitName.UnitName} - ${fromNewQuantity}, current stock in ${ToUnitName.UnitName} - ${toNewQuantity} `,
//             ipAddress: req.ip,
//             userAgent: req.headers["user-agent"]
//           }, { session });

//          // console.log('📝 Activity logs created');
          
//           // Child products don't trigger MP recalculation
//         } else {
//           throw new Error(`Invalid productType: ${productType}`);
//         }

//        // console.log(`\n✅ Product ${index + 1} completed successfully`);
//       }

//      // console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
//      // console.log('✅ All products processed sequentially');
//      // console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

//       // Create outward and inward records in parallel
//      // console.log('📝 Creating outward and inward records...');
//       const [savedOutward, savedInward] = await Promise.all([
//         new ProductOutward({
//           outwardCode,
//           fromUnitId,
//           toUnitId,
//           ownerUnitId: fromUnitId,
//           outwardDateTime: new Date(),
//           productDetails: outwardDetails,
//           createdBy: user?.employeeId || null
//         }).save({ session }),
//         new ProductInward({
//           inwardCode,
//           fromUnitId,
//           toUnitId,
//           ownerUnitId: toUnitId,
//           inwardDateTime: new Date(),
//           productDetails: inwardDetails,
//           createdBy: user?.employeeId || null
//         }).save({ session })
//       ]);
//      // console.log('✅ Records created');
//      // console.log('Outward ID:', savedOutward._id);
//      // console.log('Inward ID:', savedInward._id);

//      // console.log('\n✅ ===== TRANSACTION COMPLETED SUCCESSFULLY =====');
//      // console.log('🕐 End Time:', new Date().toISOString());

//       res.status(201).json({
//         success: true,
//         message: 'Product outward and inward successfully recorded.',
//         data: {
//           outward: savedOutward,
//           inward: savedInward
//         }
//       });
//     }, {
//       readPreference: 'primary',
//       readConcern: { level: 'local' },
//       writeConcern: { w: 'majority' },
//       maxCommitTimeMS: 120000
//     });

//   } catch (error) {
//     console.error('\n❌ ===== TRANSACTION FAILED - ROLLING BACK =====');
//     console.error('🕐 Error Time:', new Date().toISOString());
//     console.error('Error Name:', error.name);
//     console.error('Error Message:', error.message);
//     console.error('Error Stack:', error.stack);
    
//     const statusCode = error.message.includes('not found') || 
//                        error.message.includes('Invalid') ||
//                        error.message.includes('Insufficient') ? 400 : 500;
    
//     console.error('Response Status Code:', statusCode);
    
//     res.status(statusCode).json({ 
//       success: false,
//       message: error.message || 'Internal server error'
//     });
//   } finally {
//    // console.log('🔚 Ending session...');
//     await session.endSession();
//    // console.log('✅ Session ended');
//    // console.log('🔷 ===== PRODUCT OUTWARD PROCESS FINISHED =====\n');
//   }
// };

exports.createProductOutward = async (req, res) => {
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const { fromUnitId, toUnitId, products, user } = req.body;

      // 1. Basic Validation & Consolidation
      if (!fromUnitId || !toUnitId || !products?.length) throw new Error('Missing required fields');
      
      const uniqueProducts = consolidateProducts(products); // Use your existing consolidation logic
      const outwardDetails = [];
      const inwardDetails = [];

      for (const item of uniqueProducts) {
        const { productType, childProductId, parentProductId, mainParentId, quantity } = item;
        const pId = childProductId || parentProductId || mainParentId;

        // Define which model and fields to use
        const config = getProductConfig(productType); 
        
        // ------------------------------------------------------------
        // ATOMIC STEP 1: DEBIT FROM SOURCE UNIT
        // ------------------------------------------------------------
        const fromDoc = await config.model.findOneAndUpdate(
          { 
            _id: pId, 
            "stockByUnit.unitId": fromUnitId,
            [`stockByUnit.${config.availableField}`]: { $gte: quantity } // SAFETY CHECK
          },
          { $inc: { [`stockByUnit.$.${config.totalField}`]: -quantity, [`stockByUnit.$.${config.availableField}`]: -quantity } },
          { session, new: false } // Get state BEFORE update for accurate logs
        );

        if (!fromDoc) throw new Error(`Insufficient stock or product not found: ${pId}`);
        
        const fromStockObj = fromDoc.stockByUnit.find(s => s.unitId.toString() === fromUnitId.toString());
        const fromOldQty = fromStockObj[config.availableField];

        // ------------------------------------------------------------
        // ATOMIC STEP 2: CREDIT TO DESTINATION UNIT (with Upsert logic)
        // ------------------------------------------------------------
        let toDoc = await config.model.findOneAndUpdate(
          { _id: pId, "stockByUnit.unitId": toUnitId },
          { $inc: { [`stockByUnit.$.${config.totalField}`]: quantity, [`stockByUnit.$.${config.availableField}`]: quantity } },
          { session, new: false }
        );

        let toOldQty = 0;
        if (!toDoc) {
          // Unit entry doesn't exist, push it
          const freshToDoc = await config.model.findByIdAndUpdate(
            pId,
            { $push: { stockByUnit: { unitId: toUnitId, [config.totalField.split('.').pop()]: quantity, [config.availableField.split('.').pop()]: quantity, committedMPQuantity: 0, committedPPQuantity: 0, committedCPQuantity: 0 } } },
            { session, new: true }
          );
          toOldQty = 0;
        } else {
          const toStockObj = toDoc.stockByUnit.find(s => s.unitId.toString() === toUnitId.toString());
          toOldQty = toStockObj[config.availableField] || 0;
        }

        // ------------------------------------------------------------
        // ATOMIC STEP 3: CASCADE & RECALCULATE
        // ------------------------------------------------------------
        if (productType === 'Main Parent') {
          // Add logic to atomic-update constituent parents (similar to Debit/Credit above)
        }
        
        // Use the BULK recalculate function we created earlier
        await recalculateMainParentsForParent(parentProductId || pId, fromUnitId, session);
        await recalculateMainParentsForParent(parentProductId || pId, toUnitId, session);

        // Prepare Details for Logs & Records
        const detail = { ...item, fromOldQuantity: fromOldQty, fromNewQuantity: fromOldQty - quantity, toOldQuantity: toOldQty, toNewQuantity: toOldQty + quantity };
        outwardDetails.push(detail);
        inwardDetails.push(detail);

        // CREATE LOGS HERE (Using ActivityLog.logCreate as you did before)
      }

      // 4. Save Inward/Outward Records
      // ... same as your current code ...

    });
    res.status(201).json({ success: true, message: 'Transfer successful' });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  } finally {
    await session.endSession();
  }
};

// Helper to keep code clean
function getProductConfig(type) {
  if (type === 'Parent Product') return { model: ParentProduct, totalField: 'stockByUnit.$.totalPPQuantity', availableField: 'stockByUnit.$.availableToCommitPPQuantity' };
  if (type === 'Main Parent') return { model: MainParentProduct, totalField: 'stockByUnit.$.totalMPQuantity', availableField: 'stockByUnit.$.availableToCommitMPQuantity' };
  return { model: ChildProduct, totalField: 'stockByUnit.$.totalCPQuantity', availableField: 'stockByUnit.$.availableToCommitCPQuantity' };
}

exports.deleteDuplicateLogs = async (req, res) => {
  try {
    // Default to cleaning "Today" if no dates provided, 
    // or use the passed range to clean specific chunks.
    const start = req.body.startDate ? new Date(req.body.startDate) : new Date(new Date().setHours(0,0,0,0));
    const end = req.body.endDate ? new Date(req.body.endDate) : new Date(new Date().setHours(23,59,59,999));

    console.log(`🧹 Cleaning duplicates from ${start.toISOString()} to ${end.toISOString()}`);

    const duplicates = await Logs.aggregate([
      // 1. FIRST STAGE: Limit the scan to a specific date range
      // This drastically reduces memory usage
      {
        $match: {
          createdAt: { $gte: start, $lte: end }
        }
      },
      {
        $group: {
          _id: {
            entityCode: "$entityCode",
            action: "$action",
            changeField: "$changeField",
            newValue: "$newValue",
            description: "$description"
          },
          docs: { 
            $push: { 
              _id: "$_id", 
              createdAt: "$createdAt" 
            } 
          },
          count: { $sum: 1 }
        }
      },
      {
        $match: {
          count: { $gt: 1 }
        }
      }
    ], { allowDiskUse: true }); 

    if (duplicates.length === 0) {
      return res.status(200).json({ 
        success: true, 
        message: `No duplicates found between ${start.toDateString()} and ${end.toDateString()}.` 
      });
    }

    const idsToDelete = [];

    duplicates.forEach((group) => {
      // Sort newest first
      const sortedDocs = group.docs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      // Remove all except the first (newest) one
      const logsToRemove = sortedDocs.slice(1); 
      logsToRemove.forEach(doc => idsToDelete.push(doc._id));
    });

    let deleteResult = { deletedCount: 0 };
    if (idsToDelete.length > 0) {
      deleteResult = await Logs.deleteMany({ _id: { $in: idsToDelete } });
    }

    res.status(200).json({
      success: true,
      message: `Partial cleanup successful for range: ${start.toDateString()} - ${end.toDateString()}`,
      duplicatesFound: idsToDelete.length,
      deletedCount: deleteResult.deletedCount
    });

  } catch (error) {
    console.error("Cleanup Error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getProductOutwards = async (req, res) => {
  try {
    const { unitId } = req.body;

    const matchStage = { ownerUnitId: new mongoose.Types.ObjectId(unitId) };

    const outwards = await ProductOutward.aggregate([
      { $match: matchStage },

      // Lookups for units
      {
        $lookup: {
          from: 'units',
          localField: 'fromUnitId',
          foreignField: '_id',
          as: 'fromUnit'
        }
      },
      { $unwind: '$fromUnit' },

      {
        $lookup: {
          from: 'units',
          localField: 'toUnitId',
          foreignField: '_id',
          as: 'toUnit'
        }
      },
      { $unwind: '$toUnit' },

      {
        $lookup: {
          from: 'units',
          localField: 'ownerUnitId',
          foreignField: '_id',
          as: 'ownerUnit'
        }
      },
      { $unwind: '$ownerUnit' },

      // Unwind productDetails
      { $unwind: '$productDetails' },

      {
        $lookup: {
          from: 'producttypes',
          localField: 'productDetails.productTypeId',
          foreignField: '_id',
          as: 'productType'
        }
      },
      { $unwind: '$productType' },
      {
        $lookup: {
          from: 'parentproducts',
          let: { id: '$productDetails.parentProductId' },
          pipeline: [
            { $match: { $expr: { $eq: ['$_id', '$$id'] } } },
            { $project: { _id: 1, parentProductName: 1, stockByUnit: 1 } }
          ],
          as: 'parentProduct'
        }
      },
      { $unwind: { path: '$parentProduct', preserveNullAndEmptyArrays: true } },

      {
        $lookup: {
          from: 'mainparentproducts',
          let: { id: '$productDetails.mainParentId' },
          pipeline: [
            { $match: { $expr: { $eq: ['$_id', '$$id'] } } },
            { $project: { _id: 1, mainParentProductName: 1, stockByUnit: 1 } }
          ],
          as: 'mainParentProduct'
        }
      },
      { $unwind: { path: '$mainParentProduct', preserveNullAndEmptyArrays: true } },

      // Project each product detail record as a separate document
      {
        $project: {
          outwardCode: 1,
          outwardDateTime: 1,
          fromUnit: 1,
          toUnit: 1,
          fromUnitName:'$fromUnit.UnitName',
          toUnitName:'$toUnit.UnitName',
          ownerUnit: 1,
          productTypeId: '$productDetails.productTypeId',
          productTypeName: '$productType.productTypeName',
          parentProductId: '$productDetails.parentProductId',
          // parentProductName: '$parentProduct.parentProductName',
          mainParentId: '$productDetails.mainParentId',
          // mainParentName: '$mainParentProduct.mainParentProductName',
           productName: {
      $cond: {
        if: { $ifNull: ['$mainParentProduct.mainParentProductName', false] },
        then: '$mainParentProduct.mainParentProductName',
        else: '$parentProduct.parentProductName'
      }
    },
          quantity: '$productDetails.quantity',

          // ✅ NEW FIELDS added:
          fromOldQuantity: '$productDetails.fromOldQuantity',
          fromNewQuantity: '$productDetails.fromNewQuantity',
          toOldQuantity: '$productDetails.toOldQuantity',
          toNewQuantity: '$productDetails.toNewQuantity'
        }
      },

      { $sort: { outwardDateTime: -1 } }
    ]);

    res.status(200).json({ data: outwards });
  } catch (error) {
    console.error('getProductOutwards error:', error);
    res.status(500).json({ message: error.message });
  }
};

exports.getProductInwards = async (req, res) => {
  try {
    const { unitId } = req.body;

    const matchStage = { ownerUnitId: new mongoose.Types.ObjectId(unitId) };

    const inwards = await ProductInward.aggregate([
      { $match: matchStage },

      {
        $lookup: {
          from: 'units',
          localField: 'fromUnitId',
          foreignField: '_id',
          as: 'fromUnit'
        }
      },
      { $unwind: '$fromUnit' },

      {
        $lookup: {
          from: 'units',
          localField: 'toUnitId',
          foreignField: '_id',
          as: 'toUnit'
        }
      },
      { $unwind: '$toUnit' },

      {
        $lookup: {
          from: 'units',
          localField: 'ownerUnitId',
          foreignField: '_id',
          as: 'ownerUnit'
        }
      },
      { $unwind: '$ownerUnit' },

      { $unwind: '$productDetails' },

      {
        $lookup: {
          from: 'producttypes',
          localField: 'productDetails.productTypeId',
          foreignField: '_id',
          as: 'productType'
        }
      },
      { $unwind: '$productType' },
      {
        $lookup: {
          from: 'parentproducts',
          let: { id: '$productDetails.parentProductId' },
          pipeline: [
            { $match: { $expr: { $eq: ['$_id', '$$id'] } } },
            { $project: { _id: 1, parentProductName: 1, stockByUnit: 1 } }
          ],
          as: 'parentProduct'
        }
      },
      { $unwind: { path: '$parentProduct', preserveNullAndEmptyArrays: true } },

      {
        $lookup: {
          from: 'mainparentproducts',
          let: { id: '$productDetails.mainParentId' },
          pipeline: [
            { $match: { $expr: { $eq: ['$_id', '$$id'] } } },
            { $project: { _id: 1, mainParentProductName: 1, stockByUnit: 1 } }
          ],
          as: 'mainParentProduct'
        }
      },
      { $unwind: { path: '$mainParentProduct', preserveNullAndEmptyArrays: true } },

      {
        $project: {
          inwardCode: 1,
          inwardDateTime: 1,
          fromUnit: 1,
          toUnit: 1,
          ownerUnit: 1,
          fromUnitName:'$fromUnit.UnitName',
          toUnitName:'$toUnit.UnitName',
          productTypeId: '$productDetails.productTypeId',
          productTypeName: '$productType.productTypeName',
          parentProductId: '$productDetails.parentProductId',
          // parentProductName: '$parentProduct.parentProductName',
          mainParentId: '$productDetails.mainParentId',
          // mainParentName: '$mainParentProduct.mainParentProductName',
           productName: {
                $cond: {
                  if: { $ifNull: ['$mainParentProduct.mainParentProductName', false] },
                  then: '$mainParentProduct.mainParentProductName',
                  else: '$parentProduct.parentProductName'
                }
              },
          quantity: '$productDetails.quantity',
          fromOldQuantity: '$productDetails.fromOldQuantity',
          fromNewQuantity: '$productDetails.fromNewQuantity',
          toOldQuantity: '$productDetails.toOldQuantity',
          toNewQuantity: '$productDetails.toNewQuantity'
        }
      },

      { $sort: { inwardDateTime: -1 } }
    ]);

    res.status(200).json({ data: inwards });
  } catch (error) {
    console.error('getProductInwards error:', error);
    res.status(500).json({ message: error.message });
  }
};

exports.getAllUnits = async (req, res) => {
    try {
      const {unitId} = req.body
          const matchstage = {
            isActive: true,
            _id : { $ne: new mongoose.Types.ObjectId(unitId) }
          };
        const units = await Unit.find(matchstage).sort({ createdAt: -1 });
        res.status(200).json(units);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.getOutwardsByDate = async (req, res) => {
  try {
    const { fromDate, toDate, unitId } = req.body;

    if (!fromDate || !toDate) {
      return res.status(400).json({
        success: false,
        message: "Both fromDate and toDate are required",
        data: []
      });
    }

    if (!unitId) {
      return res.status(400).json({
        success: false,
        message: "unitId is required in request body",
        data: []
      });
    }

    const start = new Date(fromDate);
    const end = new Date(toDate);
    end.setHours(23, 59, 59, 999);

    const matchStage = {
      outwardDateTime: { $gte: start, $lte: end },
      $or: [
        { fromUnitId: new mongoose.Types.ObjectId(unitId) }
      ]
    };

    const outwards = await ProductOutward.aggregate([
      { $match: matchStage },

      // Lookups for units
      {
        $lookup: {
          from: "units",
          localField: "fromUnitId",
          foreignField: "_id",
          as: "fromUnit"
        }
      },
      { $unwind: "$fromUnit" },
      {
        $lookup: {
          from: "units",
          localField: "toUnitId",
          foreignField: "_id",
          as: "toUnit"
        }
      },
      { $unwind: "$toUnit" },
      {
        $lookup: {
          from: "units",
          localField: "ownerUnitId",
          foreignField: "_id",
          as: "ownerUnit"
        }
      },
      { $unwind: "$ownerUnit" },

      // Unwind productDetails
      { $unwind: "$productDetails" },

      {
        $lookup: {
          from: "producttypes",
          localField: "productDetails.productTypeId",
          foreignField: "_id",
          as: "productType"
        }
      },
      { $unwind: "$productType" },

      {
        $lookup: {
          from: "parentproducts",
          let: { id: "$productDetails.parentProductId" },
          pipeline: [
            { $match: { $expr: { $eq: ["$_id", "$$id"] } } },
            { $project: { _id: 1, parentProductName: 1, stockByUnit: 1 } }
          ],
          as: "parentProduct"
        }
      },
      {
        $unwind: {
          path: "$parentProduct",
          preserveNullAndEmptyArrays: true
        }
      },

      {
        $lookup: {
          from: "mainparentproducts",
          let: { id: "$productDetails.mainParentId" },
          pipeline: [
            { $match: { $expr: { $eq: ["$_id", "$$id"] } } },
            { $project: { _id: 1, mainParentProductName: 1, stockByUnit: 1 } }
          ],
          as: "mainParentProduct"
        }
      },
      {
        $unwind: {
          path: "$mainParentProduct",
          preserveNullAndEmptyArrays: true
        }
      },

      // Project final structure
      {
        $project: {
          outwardCode: 1,
          outwardDateTime: 1,
          fromUnit: 1,
          toUnit: 1,
          fromUnitName: "$fromUnit.UnitName",
          toUnitName: "$toUnit.UnitName",
          ownerUnit: 1,
          productTypeId: "$productDetails.productTypeId",
          productTypeName: "$productType.productTypeName",
          parentProductId: "$productDetails.parentProductId",
          mainParentId: "$productDetails.mainParentId",
          productName: {
            $cond: {
              if: { $ifNull: ["$mainParentProduct.mainParentProductName", false] },
              then: "$mainParentProduct.mainParentProductName",
              else: "$parentProduct.parentProductName"
            }
          },
          quantity: "$productDetails.quantity",
          fromOldQuantity: "$productDetails.fromOldQuantity",
          fromNewQuantity: "$productDetails.fromNewQuantity",
          toOldQuantity: "$productDetails.toOldQuantity",
          toNewQuantity: "$productDetails.toNewQuantity"
        }
      },

      { $sort: { outwardDateTime: -1 } }
    ]);

    res.status(200).json({
      success: true,
      message: "Product outwards fetched successfully",
      count: outwards.length,
      data: outwards
    });
  } catch (error) {
    console.error("Error fetching product outwards:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching product outwards",
      data: [],
      error: error.message
    });
  }
};

exports.getInwardsByDate = async (req, res) => {
  try {
    const { fromDate, toDate, unitId } = req.body;

    if (!fromDate || !toDate) {
      return res.status(400).json({
        success: false,
        message: "Both fromDate and toDate are required",
        data: []
      });
    }

    if (!unitId) {
      return res.status(400).json({
        success: false,
        message: "unitId is required in request body",
        data: []
      });
    }
     const start = new Date(fromDate);
    const end = new Date(toDate);
    end.setHours(23, 59, 59, 999);

    const matchStage = {
      inwardDateTime: { $gte: start, $lte: end },
      $or: [
        { toUnitId: new mongoose.Types.ObjectId(unitId) }
      ]
    };

    const inwards = await ProductInward.aggregate([
      { $match: matchStage },

      // Lookups for units
      {
        $lookup: {
          from: "units",
          localField: "fromUnitId",
          foreignField: "_id",
          as: "fromUnit"
        }
      },
      { $unwind: "$fromUnit" },
      {
        $lookup: {
          from: "units",
          localField: "toUnitId",
          foreignField: "_id",
          as: "toUnit"
        }
      },
      { $unwind: "$toUnit" },
      {
        $lookup: {
          from: "units",
          localField: "ownerUnitId",
          foreignField: "_id",
          as: "ownerUnit"
        }
      },
      { $unwind: "$ownerUnit" },

      // Unwind productDetails
      { $unwind: "$productDetails" },

      {
        $lookup: {
          from: "producttypes",
          localField: "productDetails.productTypeId",
          foreignField: "_id",
          as: "productType"
        }
      },
      { $unwind: "$productType" },

      {
        $lookup: {
          from: "parentproducts",
          let: { id: "$productDetails.parentProductId" },
          pipeline: [
            { $match: { $expr: { $eq: ["$_id", "$$id"] } } },
            { $project: { _id: 1, parentProductName: 1, stockByUnit: 1 } }
          ],
          as: "parentProduct"
        }
      },
      {
        $unwind: {
          path: "$parentProduct",
          preserveNullAndEmptyArrays: true
        }
      },

      {
        $lookup: {
          from: "mainparentproducts",
          let: { id: "$productDetails.mainParentId" },
          pipeline: [
            { $match: { $expr: { $eq: ["$_id", "$$id"] } } },
            { $project: { _id: 1, mainParentProductName: 1, stockByUnit: 1 } }
          ],
          as: "mainParentProduct"
        }
      },
      {
        $unwind: {
          path: "$mainParentProduct",
          preserveNullAndEmptyArrays: true
        }
      },

      // Final shape
      {
        $project: {
          inwardCode: 1,
          inwardDateTime: 1,
          fromUnit: 1,
          toUnit: 1,
          fromUnitName: "$fromUnit.UnitName",
          toUnitName: "$toUnit.UnitName",
          ownerUnit: 1,
          productTypeId: "$productDetails.productTypeId",
          productTypeName: "$productType.productTypeName",
          parentProductId: "$productDetails.parentProductId",
          mainParentId: "$productDetails.mainParentId",
          productName: {
            $cond: {
              if: { $ifNull: ["$mainParentProduct.mainParentProductName", false] },
              then: "$mainParentProduct.mainParentProductName",
              else: "$parentProduct.parentProductName"
            }
          },
          quantity: "$productDetails.quantity",
          fromOldQuantity: "$productDetails.fromOldQuantity",
          fromNewQuantity: "$productDetails.fromNewQuantity",
          toOldQuantity: "$productDetails.toOldQuantity",
          toNewQuantity: "$productDetails.toNewQuantity"
        }
      },

      { $sort: { inwardDateTime: -1 } }
    ]);

    res.status(200).json({
      success: true,
      message: "Product inwards fetched successfully",
      count: inwards.length,
      data: inwards
    });
  } catch (error) {
    console.error("Error fetching product inwards:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching product inwards",
      data: [],
      error: error.message
    });
  }
};