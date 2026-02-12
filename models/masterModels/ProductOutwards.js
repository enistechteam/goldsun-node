// models/ProductOutward.js

const mongoose = require('mongoose');
const { Schema } = mongoose;

const productDetailSchema = new Schema({
  productTypeId: {
    type: Schema.Types.ObjectId,
    ref: 'ProductType',
    required: true
  },
  childProductId: {
    type: Schema.Types.ObjectId,
    ref: 'ChildProduct',
    default: null
  },
  parentProductId: {
    type: Schema.Types.ObjectId,
    ref: 'ParentProduct',
    default: null
  },
  mainParentId: {
    type: Schema.Types.ObjectId,
    ref: 'MainParentProduct',
    default: null
  },
  quantity: {
    type: Number,
    required: true
  },

  // New fields for tracking stock movement:
  fromOldQuantity: {
    type: Number,
    required: true
  },
  fromNewQuantity: {
    type: Number,
    required: true
  },
  toOldQuantity: {
    type: Number,
    required: true
  },
  toNewQuantity: {
    type: Number,
    required: true
  }
});

const productOutwardSchema = new Schema({
  outwardCode: {
    type: String,
    required: true,
    unique: true
  },
  fromUnitId: {
    type: Schema.Types.ObjectId,
    ref: 'Unit',
    required: true
  },
  toUnitId: {
    type: Schema.Types.ObjectId,
    ref: 'Unit',
    required: true
  },
  outwardDateTime: {
    type: Date,
    required: true
  },
  ownerUnitId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Unit",
    required: true
  },
  productDetails: [productDetailSchema],
  remarks: {
    type: String,
    default: ""
  },
  createdBy: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  }
}, { timestamps: true });

module.exports = mongoose.model('ProductOutward', productOutwardSchema);
