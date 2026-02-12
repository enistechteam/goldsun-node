const mongoose = require("mongoose");
const Order = require("../../models/masterModels/OrderCreation"); // adjust your path

exports.filterOrders = async (req, res) => {
  try {
    const {
      unitId,
      OrderID,
      customerID,
      status,
      fromOrderDate,
      toOrderDate,
      productTypeId,
      childProductId,
      parentProductId,
      mainParentId,
      location,
      orderType
    } = req.body;

    if (!unitId) {
      return res.status(400).json({
        message: "Unit ID is required"
      });
    }

    const matchStage = {
      isActive: true,
      unitId: new mongoose.Types.ObjectId(unitId)
    };

    if (OrderID !== undefined && OrderID !== "") {
      matchStage.OrderID = OrderID;
    }
    if (customerID) {
      matchStage.customerId = new mongoose.Types.ObjectId(customerID);
    }
    if (location) {
      matchStage.orderShippingAddress = location;
    }
    if (status && status !== 'All Orders' && status !== '') {
      matchStage.status = status;
    }
    if (orderType) {
      matchStage.orderType = orderType;
    }

    function parseDDMMYYYY(dateStr) {
      if (!dateStr) return null;
      const [day, month, year] = dateStr.split("-");
      return new Date(`${year}-${month}-${day}T00:00:00Z`);
    }

    function parseDDMMYYYYEndOfDay(dateStr) {
      if (!dateStr) return null;
      const [day, month, year] = dateStr.split("-");
      return new Date(`${year}-${month}-${day}T23:59:59.999Z`);
    }

    if (fromOrderDate || toOrderDate) {
      matchStage.orderDate = {};
      if (fromOrderDate) {
        const parsedFrom = parseDDMMYYYY(fromOrderDate);
        if (!isNaN(parsedFrom)) {
          matchStage.orderDate.$gte = parsedFrom;
        }
      }
      if (toOrderDate) {
        const parsedTo = parseDDMMYYYYEndOfDay(toOrderDate);
        if (!isNaN(parsedTo)) {
          matchStage.orderDate.$lte = parsedTo;
        }
      }
    }

    // Handle filters on productDetails array
    const productDetailsFilters = {};
    if (productTypeId) {
      productDetailsFilters["productDetails.productTypeId"] = new mongoose.Types.ObjectId(productTypeId);
    }
    if (childProductId) {
      productDetailsFilters["productDetails.childProductId"] = new mongoose.Types.ObjectId(childProductId);
    }
    if (parentProductId) {
      productDetailsFilters["productDetails.parentProductId"] = new mongoose.Types.ObjectId(parentProductId);
    }
    if (mainParentId) {
      productDetailsFilters["productDetails.mainParentId"] = new mongoose.Types.ObjectId(mainParentId);
    }

    const pipeline = [{
        $match: {
          ...matchStage,
          ...productDetailsFilters
        }
      },

      // Join customer details
      {
        $lookup: {
          from: 'customers',
          localField: 'customerId',
          foreignField: '_id',
          as: 'customer'
        }
      },
      {
        $unwind: {
          path: '$customer',
          preserveNullAndEmptyArrays: true
        }
      },

      // unwind productDetails
      {
        $unwind: {
          path: '$productDetails',
          preserveNullAndEmptyArrays: true
        }
      },

      // Lookup productType
      {
        $lookup: {
          from: 'producttypes',
          localField: 'productDetails.productTypeId',
          foreignField: '_id',
          as: 'productType'
        }
      },
      {
        $unwind: {
          path: '$productType',
          preserveNullAndEmptyArrays: true
        }
      },

      // Lookup child product
      {
        $lookup: {
          from: 'childproducts',
          localField: 'productDetails.childProductId',
          foreignField: '_id',
          as: 'childProduct'
        }
      },
      {
        $unwind: {
          path: '$childProduct',
          preserveNullAndEmptyArrays: true
        }
      },

      // Lookup parent product
      {
        $lookup: {
          from: 'parentproducts',
          localField: 'productDetails.parentProductId',
          foreignField: '_id',
          as: 'parentProduct'
        }
      },
      {
        $unwind: {
          path: '$parentProduct',
          preserveNullAndEmptyArrays: true
        }
      },

      // Lookup main parent product
      {
        $lookup: {
          from: 'mainparentproducts',
          localField: 'productDetails.mainParentId',
          foreignField: '_id',
          as: 'mainParentProduct'
        }
      },
      {
        $unwind: {
          path: '$mainParentProduct',
          preserveNullAndEmptyArrays: true
        }
      },

      // Group back the productDetails array
      {
        $addFields: {
          productName: {
            $cond: [{
                $ifNull: ["$childProduct._id", false]
              },
              "$childProduct.childProductName",
              {
                $cond: [{
                    $ifNull: ["$parentProduct._id", false]
                  },
                  "$parentProduct.parentProductName",
                  {
                    $cond: [{
                        $ifNull: ["$mainParentProduct._id", false]
                      },
                      "$mainParentProduct.mainParentProductName",
                      null
                    ]
                  }
                ]
              }
            ]
          },
          availableQuantity: {
            $cond: [{
                $ifNull: ["$childProduct._id", false]
              },
              {
                $ifNull: [{
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
                  {
                    availableToCommitCPQuantity: 0
                  }
                ]
              },
              {
                $cond: [{
                    $ifNull: ["$parentProduct._id", false]
                  },
                  {
                    $ifNull: [{
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
                      {
                        availableToCommitPPQuantity: 0
                      }
                    ]
                  },
                  {
                    $cond: [{
                        $ifNull: ["$mainParentProduct._id", false]
                      },
                      {
                        $ifNull: [{
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
                          {
                            totalMPQuantity: 0
                          }
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
      {
        $group: {
          _id: '$_id',
          orderCode: {
            $first: '$orderCode'
          },
          orderName: {
            $first: '$orderName'
          },
          unitId: {
            $first: '$unitId'
          },
          orderDate: {
            $first: '$orderDate'
          },
          orderShippingAddress: {
            $first: '$orderShippingAddress'
          },
          orderAddress: {
            $first: '$orderAddress'
          },
          status: {
            $first: '$status'
          },
          orderType: {
            $first: '$orderType'
          },
          orderConfirmDate: {
            $first: '$orderConfirmDate'
          },
          customerId: {
            $first: '$customer._id'
          },
          customerName: {
            $first: '$customer.customerName'
          },
          createdAt: {
            $first: '$createdAt'
          },
          updatedAt: {
            $first: '$updatedAt'
          },
          productDetails: {
            $push: {
              productTypeId: '$productDetails.productTypeId',
              productTypeName: '$productType.productTypeName',
              childProductId: '$productDetails.childProductId',
              childProductName: '$childProduct.childProductName',
              parentProductId: '$productDetails.parentProductId',
              parentProductName: '$parentProduct.parentProductName',
              mainParentId: '$productDetails.mainParentId',
              mainParentProductName: '$mainParentProduct.mainParentProductName',
              requiredQuantity: '$productDetails.requiredQuantity',
              assignedQuantity: '$productDetails.assignedQuantity',
              availableQuantity: {
                $cond: [{
                    $ifNull: ["$childProduct._id", false]
                  },
                  "$availableQuantity.availableToCommitCPQuantity",
                  {
                    $cond: [{
                        $ifNull: ["$parentProduct._id", false]
                      },
                      "$availableQuantity.availableToCommitPPQuantity",
                      {
                        $cond: [{
                            $ifNull: ["$mainParentProduct._id", false]
                          },
                          "$availableQuantity.totalMPQuantity",
                          null
                        ]
                      }
                    ]
                  }
                ]
              },
              productName: '$productName'
            }
          }
        }
      },

      // Compute totalItems
      {
        $addFields: {
          totalItems: {
            $sum: {
              $map: {
                input: '$productDetails',
                as: 'item',
                in: {
                  $cond: [{
                      $or: [{
                          $eq: [status, "All Orders"]
                        },
                        {
                          $eq: [status, "Order Pending"]
                        }
                      ]
                    },
                    {
                      $toInt: "$$item.requiredQuantity"
                    }, // use required
                    {
                      $toInt: "$$item.assignedQuantity"
                    } // else use assigned
                  ]
                }
              }
            }
          }
        }
      },
      {
        $addFields: {
          // When NOT Order Confirmed → used for first-level sort (DESC)
          sortDate: {
            $cond: [{
                $ne: ["$status", "Order Confirmed"]
              },
              "$orderDate",
              null
            ]
          },

          // When NOT Order Confirmed → used for second-level sort (DESC)
          sortCode: {
            $cond: [{
                $ne: ["$status", "Order Confirmed"]
              },
              "$orderCode",
              null
            ]
          },

          // When Order Confirmed → used for ASC sorting
          sortCustomerAsc: {
            $cond: [{
                $eq: ["$status", "Order Confirmed"]
              },
              "$customerName",
              null
            ]
          }
        }
      },
      {
        $sort: {
          sortCustomerAsc: 1, // ASC only for "Order Confirmed"
          sortDate: -1, // DESC only for other statuses
          sortCode: -1 // DESC only for other statuses
        }
      }
    ];

    // 2. Conditionally add Limit Logic Here
    // Covers: explicitly 'All Orders', explicitly '', or undefined/null (safety)
    if (!status || status === 'All Orders' || status === '') {
      pipeline.push({
        $limit: 500
      });
    }

    // 3. Execute Pipeline
    const orders = await Order.aggregate(pipeline);

    res.status(200).json(orders);

  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: error.message
    });
  }
};

exports.filterPendingOrdersByProduct = async (req, res) => {
  try {
    const {
      unitId,
      childProductId,
      parentProductId,
      mainParentId,
      orderType
    } = req.body;

    if (!unitId) {
      return res.status(400).json({ message: "Unit ID is required" });
    }

    const unitObjectId = new mongoose.Types.ObjectId(unitId);

    const matchStage = {
      isActive: true,
      unitId: unitObjectId,
      status: 'Order Pending'
    };

    if (orderType) {
      matchStage.orderType = orderType;
    }

    const productMatchStage = {};
    if (childProductId) {
      productMatchStage["productDetails.childProductId"] = new mongoose.Types.ObjectId(childProductId);
    }
    if (parentProductId) {
      productMatchStage["productDetails.parentProductId"] = new mongoose.Types.ObjectId(parentProductId);
    }
    if (mainParentId) {
      productMatchStage["productDetails.mainParentId"] = new mongoose.Types.ObjectId(mainParentId);
    }

    const pipeline = [

      { $match: matchStage },

      // Lookup customer
      {
        $lookup: {
          from: 'customers',
          localField: 'customerId',
          foreignField: '_id',
          as: 'customer'
        }
      },
      { $unwind: { path: '$customer', preserveNullAndEmptyArrays: true } },

      // Unwind product details
      { $unwind: { path: '$productDetails', preserveNullAndEmptyArrays: false } },

      // Apply product filters
      { $match: productMatchStage },

      // Compute pending quantity
      {
        $addFields: {
          pendingQuantity: {
            $subtract: [
              { $toDouble: '$productDetails.requiredQuantity' },
              { $toDouble: '$productDetails.assignedQuantity' }
            ]
          }
        }
      },

      // Only pending items
      {
        $match: { pendingQuantity: { $gt: 0 } }
      },

      // Lookups for product names
      {
        $lookup: {
          from: 'childproducts',
          localField: 'productDetails.childProductId',
          foreignField: '_id',
          as: 'childProduct'
        }
      },
      {
        $lookup: {
          from: 'parentproducts',
          localField: 'productDetails.parentProductId',
          foreignField: '_id',
          as: 'parentProduct'
        }
      },
      {
        $lookup: {
          from: 'mainparentproducts',
          localField: 'productDetails.mainParentId',
          foreignField: '_id',
          as: 'mainParentProduct'
        }
      },

      // Unwind the lookups
      { $unwind: { path: '$childProduct', preserveNullAndEmptyArrays: true } },
      { $unwind: { path: '$parentProduct', preserveNullAndEmptyArrays: true } },
      { $unwind: { path: '$mainParentProduct', preserveNullAndEmptyArrays: true } },

      // Compute parent available quantity
      {
        $addFields: {
          parentProductStock: {
            $filter: {
              input: '$parentProduct.stockByUnit',
              as: 'stock',
              cond: {
                $eq: ['$$stock.unitId', unitObjectId]
              }
            }
          }
        }
      },

      {
        $addFields: {
          parentAvailableQuantity: {
            $cond: [
              { $gt: [{ $size: '$parentProductStock' }, 0] },
              { $toDouble: { $arrayElemAt: ['$parentProductStock.availableToCommitPPQuantity', 0] } },
              null
            ]
          }
        }
      },

      // Project final fields
      {
        $project: {
          _id: '$productDetails._id',
          orderId: '$_id',
          orderCode: 1,
          orderType: 1,
          unitId: 1,
          orderDate: 1,

          customerId: '$customer._id',
          customerName: '$customer.customerName',

          childProductId: '$productDetails.childProductId',
          childProductName: '$childProduct.childProductName',

          parentProductId: '$productDetails.parentProductId',
          parentProductName: '$parentProduct.parentProductName',

          mainParentId: '$productDetails.mainParentId',
          mainParentProductName: '$mainParentProduct.mainParentProductName',

          requiredQuantity: '$productDetails.requiredQuantity',
          assignedQuantity: '$productDetails.assignedQuantity',
          pendingQuantity: 1,

          availableQuantity: '$parentAvailableQuantity'
        }
      },

      // Add running unique ID
      {
        $setWindowFields: {
          sortBy: { orderDate: -1 },
          output: {
            uniqueId: { $documentNumber: {} }
          }
        }
      },

      { $sort: { uniqueId: 1 } }
    ];

    const result = await Order.aggregate(pipeline);

    res.status(200).json({
      message: "Item-wise pending parent/main parent products fetched successfully.",
      data: result
    });

  } catch (error) {
    console.error("❌ Error filtering pending orders:", error);
    res.status(500).json({ message: error.message });
  }
};

exports.getAllItemwisePendingOrders = async (req, res) => {
  try {
    const { unitId, orderType } = req.body;

    if (!unitId) {
      return res.status(400).json({ message: "Unit ID is required" });
    }

    const unitObjectId = new mongoose.Types.ObjectId(unitId);

    const matchStage = {
      isActive: true,
      unitId: unitObjectId,
      status: 'Order Pending'
    };

    if (orderType) {
      matchStage.orderType = orderType;
    }

    const pipeline = [
      { $match: matchStage },

      {
        $lookup: {
          from: 'customers',
          localField: 'customerId',
          foreignField: '_id',
          as: 'customer'
        }
      },
      { $unwind: { path: '$customer', preserveNullAndEmptyArrays: true } },

      { $unwind: { path: '$productDetails', preserveNullAndEmptyArrays: false } },

      {
        $addFields: {
          pendingQuantity: {
            $subtract: [
              { $toDouble: '$productDetails.requiredQuantity' },
              { $toDouble: '$productDetails.assignedQuantity' }
            ]
          }
        }
      },

      {
        $match: {
          pendingQuantity: { $gt: 0 },
          $or: [
            { 'productDetails.parentProductId': { $ne: null } },
            { 'productDetails.mainParentId': { $ne: null } }
          ]
        }
      },

      {
        $lookup: {
          from: 'parentproducts',
          localField: 'productDetails.parentProductId',
          foreignField: '_id',
          as: 'parentProduct'
        }
      },

      {
        $lookup: {
          from: 'mainparentproducts',
          localField: 'productDetails.mainParentId',
          foreignField: '_id',
          as: 'mainParentProduct'
        }
      },

      {
        $unwind: {
          path: '$parentProduct',
          preserveNullAndEmptyArrays: true
        }
      },

      {
        $addFields: {
          parentProductStock: {
            $filter: {
              input: '$parentProduct.stockByUnit',
              as: 'stock',
              cond: {
                $eq: ['$$stock.unitId', unitObjectId]
              }
            }
          }
        }
      },

      {
        $addFields: {
          parentAvailableQuantity: {
            $cond: [
              { $gt: [{ $size: '$parentProductStock' }, 0] },
              { $toDouble: { $arrayElemAt: ['$parentProductStock.availableToCommitPPQuantity', 0] } },
              null
            ]
          }
        }
      },

      {
        $project: {
          orderId: '$_id',
          orderCode: 1,
          orderDate: 1,
          orderType: 1,
          unitId: 1,

          customerId: '$customer._id',
          customerName: '$customer.customerName',

          productTypeId: '$productDetails.productTypeId',
          productTypeName: '$parentProduct.productTypeName',

          parentProductId: '$productDetails.parentProductId',
          parentProductName: '$parentProduct.parentProductName',

          mainParentId: '$productDetails.mainParentId',
          mainParentProductName: {
            $arrayElemAt: ['$mainParentProduct.mainParentProductName', 0]
          },

          requiredQuantity: '$productDetails.requiredQuantity',
          assignedQuantity: '$productDetails.assignedQuantity',
          pendingQuantity: 1,

          availableQuantity: '$parentAvailableQuantity'
        }
      },

      // ✅ Only ONE sort field here:
      {
        $setWindowFields: {
          sortBy: { orderDate: -1 },
          output: {
            uniqueId: { $documentNumber: {} }
          }
        }
      },

      {
        $sort: { uniqueId: 1 }
      }
    ];

    const result = await Order.aggregate(pipeline);

    res.status(200).json({
      message: "Item-wise pending parent/main parent products fetched successfully.",
      data: result
    });

  } catch (error) {
    console.error("❌ Error fetching item-wise pending orders:", error);
    res.status(500).json({ message: error.message });
  }
};

exports.getAllOrderwisePendingOrders = async (req, res) => {
  try {
    const { unitId, orderType, productTypeId, parentProductId, mainParentId, search ,customerID,location} = req.body;

    if (!unitId) {
      return res.status(400).json({ message: "Unit ID is required" });
    }
    // if (!search || typeof search !== "string") {
    //   return res.status(400).json({ message: "Search string is required" });
    // }
    const matchStage = {
      isActive: true,
      unitId: new mongoose.Types.ObjectId(unitId),
      status: "Order Pending",
    };

    if (orderType) {
      matchStage.orderType = orderType;
    }
        if (customerID) {
      matchStage.customerId = new mongoose.Types.ObjectId(customerID);
    }
        if(location){
      matchStage.orderShippingAddress=location
    }
 const regex = new RegExp(search, "i");
    const pipeline = [
      { $match: matchStage },
      {
        $lookup: {
          from: "customers",
          localField: "customerId",
          foreignField: "_id",
          as: "customer",
        },
      },
      { $unwind: { path: "$customer", preserveNullAndEmptyArrays: true } },

      { $unwind: { path: "$productDetails", preserveNullAndEmptyArrays: false } },

      {
        $addFields: {
          pendingQuantity: {
            $subtract: [
              { $toDouble: "$productDetails.requiredQuantity" },
              { $toDouble: "$productDetails.assignedQuantity" },
            ],
          },
        },
      },

      {
        $match: {
          pendingQuantity: { $gte: 0 },
          $or: [
            { "productDetails.parentProductId": { $ne: null } },
            { "productDetails.mainParentId": { $ne: null } },
          ],
        },
      },
    ];

    // ✅ Apply product filters
    if (productTypeId) {
      pipeline.push({
        $match: { "productDetails.productTypeId": new mongoose.Types.ObjectId(productTypeId) },
      });
    }

    if (parentProductId) {
      pipeline.push({
        $match: { "productDetails.parentProductId": new mongoose.Types.ObjectId(parentProductId) },
      });
    }

    if (mainParentId) {
      pipeline.push({
        $match: { "productDetails.mainParentId": new mongoose.Types.ObjectId(mainParentId) },
      });
    }

    // Rest of pipeline
    pipeline.push(
      {
        $lookup: {
          from: "parentproducts",
          localField: "productDetails.parentProductId",
          foreignField: "_id",
          as: "parentProduct",
        },
      },
      { $unwind: { path: "$parentProduct", preserveNullAndEmptyArrays: true } },

      {
        $lookup: {
          from: "mainparentproducts",
          localField: "productDetails.mainParentId",
          foreignField: "_id",
          as: "mainParentProduct",
        },
      },
      { $unwind: { path: "$mainParentProduct", preserveNullAndEmptyArrays: true } },

      {
        $addFields: {
          parentStock: {
            $filter: {
              input: "$parentProduct.stockByUnit",
              as: "stock",
              cond: { $eq: ["$$stock.unitId", new mongoose.Types.ObjectId(unitId)] },
            },
          },
          mainParentStock: {
            $filter: {
              input: "$mainParentProduct.stockByUnit",
              as: "stock",
              cond: { $eq: ["$$stock.unitId", new mongoose.Types.ObjectId(unitId)] },
            },
          },
        },
      },

      {
        $addFields: {
          availableQuantity: {
            $cond: [
              { $ne: ["$productDetails.parentProductId", null] },
              {
                $cond: [
                  { $gt: [{ $size: "$parentStock" }, 0] },
                  { $toDouble: { $arrayElemAt: ["$parentStock.availableToCommitPPQuantity", 0] } },
                  0,
                ],
              },
              {
                $cond: [
                  { $gt: [{ $size: "$mainParentStock" }, 0] },
                  { $toDouble: { $arrayElemAt: ["$mainParentStock.totalMPQuantity", 0] } },
                  0,
                ],
              },
            ],
          },
        },
      },

      {
        $addFields: {
          "productDetails.availableQuantity": "$availableQuantity",
          "productDetails.productName": {
            $cond: [
              { $ne: ["$productDetails.parentProductId", null] },
              "$parentProduct.parentProductName",
              "$mainParentProduct.mainParentProductName",
            ],
          },
        },
      },

{
  $match: {
    $or: [
      { orderCode: regex },
      { "customer.customerName": regex },
      { orderAddress: regex },
      { orderShippingAddress: regex },
      { "productDetails.productName": regex },
    ],
  },
},

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
          productDetails: { $push: "$productDetails" },
        },
      },

      {
        $addFields: {
          totalItems: {
            $sum: {
              $map: {
                input: "$productDetails",
                as: "item",
                in: { $toInt: "$$item.requiredQuantity" },
              },
            },
          },
        },
      },

      { $sort: { createdAt: -1 } }
    );

    const result = await Order.aggregate(pipeline);

    res.status(200).json({
      message: "Orders with pending products fetched successfully.",
      data: result,
    });
  } catch (error) {
    console.error("❌ Error fetching pending orders:", error);
    res.status(500).json({ message: error.message });
  }
};

exports.getPendingOrderCounts = async (req, res) => {
  try {
    const { unitId } = req.body;

    const matchStage = {
      isActive: true,
      status: "Order Pending"
    };

    if (unitId) {
      matchStage.unitId = new mongoose.Types.ObjectId(unitId);
    }

    const counts = await Order.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: "$orderType",
          count: { $sum: 1 }
        }
      }
    ]);

    // Default response structure
    const response = {
      mainOrders: 0,
      microOrders: 0
    };

    counts.forEach(c => {
      if (c._id === "MainOrder") response.mainOrders = c.count;
      if (c._id === "MicroOrder") response.microOrders = c.count;
    });

    res.status(200).json({
      success: true,
      data: response
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching pending order counts",
      error: error.message
    });
  }
};

// controllers/orderController.js
exports.searchOrders = async (req, res) => {
  try {
    const { unitId, search ,orderType,status} = req.body;

    if (!unitId) {
      return res.status(400).json({ message: "Unit ID is required" });
    }
    if (!search || typeof search !== "string") {
      return res.status(400).json({ message: "Search string is required" });
    }
    const matchStage = {
      isActive: true,
          unitId: new mongoose.Types.ObjectId(unitId),
    };

    if (orderType) {
      matchStage.orderType = orderType;
    }
    if(status){
      matchStage.status = status
    }
    const regex = new RegExp(search, "i");

    const orders = await Order.aggregate([
      {
        $match: matchStage,
      },

      // Join customer
      {
        $lookup: {
          from: "customers",
          localField: "customerId",
          foreignField: "_id",
          as: "customer",
        },
      },
      { $unwind: { path: "$customer", preserveNullAndEmptyArrays: true } },

      // Unwind productDetails
      {
        $unwind: {
          path: "$productDetails",
          preserveNullAndEmptyArrays: true,
        },
      },

      // Lookup productType
      {
        $lookup: {
          from: "producttypes",
          localField: "productDetails.productTypeId",
          foreignField: "_id",
          as: "productType",
        },
      },
      { $unwind: { path: "$productType", preserveNullAndEmptyArrays: true } },

      // Lookup parent product
      {
        $lookup: {
          from: "parentproducts",
          localField: "productDetails.parentProductId",
          foreignField: "_id",
          as: "parentProduct",
        },
      },
      { $unwind: { path: "$parentProduct", preserveNullAndEmptyArrays: true } },

      // Lookup main parent product
      {
        $lookup: {
          from: "mainparentproducts",
          localField: "productDetails.mainParentId",
          foreignField: "_id",
          as: "mainParentProduct",
        },
      },
      {
        $unwind: {
          path: "$mainParentProduct",
          preserveNullAndEmptyArrays: true,
        },
      },

      // Add productName for easier matching
      {
        $addFields: {
          productName: {
                $cond: [
                  { $ifNull: ["$parentProduct._id", false] },
                  "$parentProduct.parentProductName",
                  {
                    $cond: [
                      { $ifNull: ["$mainParentProduct._id", false] },
                      "$mainParentProduct.mainParentProductName",
                      null,
                    ],
                  },
                ],
          },
        },
      },

      // Match against search string
      {
        $match: {
          $or: [
            { orderCode: regex },
            { "customer.customerName": regex },
            { orderAddress: regex },
            { orderShippingAddress: regex },
            { productName: regex },
          ],
        },
      },
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
                            { totalMPQuantity: 0 }
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
      // Group back productDetails
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
              parentProductId: "$productDetails.parentProductId",
              parentProductName: "$parentProduct.parentProductName",
              mainParentId: "$productDetails.mainParentId",
              mainParentProductName:
                "$mainParentProduct.mainParentProductName",
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
                      "$availableQuantity.totalMPQuantity",
                      null
                    ]
                  }
                ]
              }
            ]
          },
              productName: "$productName",
            },
          },
        },
      },

      { $sort: { createdAt: -1 } },
    ]);

    res.status(200).json(orders);
  } catch (error) {
    console.error("Search Orders Error:", error);
    res.status(500).json({ message: error.message });
  }
};