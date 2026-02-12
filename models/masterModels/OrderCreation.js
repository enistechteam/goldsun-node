const mongoose = require('mongoose');

const OrderSchema = new mongoose.Schema(
  {
    orderCode: {
      type: String,
      required: true,
      unique: true,
      trim: true
    },
    orderName: {
      type: String,
      trim: true
    },
    orderType: {
      type: String,
      enum: ['MainOrder', 'MicroOrder'],
      default: 'MainOrder'
    },
    unitId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Unit',
      required: true
    },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
      required: true
    },
    orderShippingAddress: {
      type: String,
      trim: true
    },
    orderAddress: {
      type: String,
      trim: true
    },
    orderDate: {
      type: Date,
      required: true
    },
    orderConfirmDate: {
      type: Date,
      default: null
    },
    productDetails: [
      {
        productTypeId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'ProductType',
          required: true
        },
        childProductId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'ChildProduct',
          default: null
        },
        parentProductId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'ParentProduct',
          default: null
        },
        mainParentId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'MainParentProduct',
          default: null
        },
        requiredQuantity: {
          type: Number,
          required: true,
          default: 0
        },
        assignedQuantity: {
          type: Number,
          default: 0
        }
      }
    ],
    status: {
      type: String,
      enum: ['Order Pending', 'Order Confirmed', 'Order Executed'],
      default: 'Order Pending'
    },
    isActive: {
      type: Boolean,
      default: true
    }
  },
  {
    timestamps: true
  }
);

OrderSchema.index({ "orderCode": 1 }, { "unique": true });
OrderSchema.index({ "unitId": 1, "isActive": 1, "status": 1, "createdAt": -1 });
OrderSchema.index({ "productDetails.childProductId": 1 });
OrderSchema.index({ "productDetails.parentProductId": 1 });
OrderSchema.index({ "productDetails.mainParentId": 1 });
OrderSchema.index({ "productDetails.productTypeId": 1 });
OrderSchema.index({ "unitId": 1, "orderType": 1 }); 
OrderSchema.index({ "unitId": 1, "customerId": 1 }); 
OrderSchema.index({ "unitId": 1, "orderDate": -1 });

module.exports = mongoose.model('Order', OrderSchema);