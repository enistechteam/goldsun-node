const mongoose = require('mongoose');

// Define embedded schema for stock by unit
const StockByUnitSchema = new mongoose.Schema(
  {
    unitId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Unit',
      required: true
    },
    totalCPQuantity: {
      type: Number,
      required: true,
      default: 0
    },
    committedCPQuantity: {
      type: Number,
      required: true,
      default: 0
    },
    availableToCommitCPQuantity: {
      type: Number,
      required: true,
      default: 0
    }
  },
  { _id: false } // prevent creating extra _id for each subdoc
);

const ChildProductSchema = new mongoose.Schema(
  {
    childProductCode: {
      type: String,
      required: true,
      unique: true,
      trim: true
    },
    childProductName: {
      type: String,
      required: true,
      trim: true
    },
    categoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      required: true
    },
    stockByUnit: {
      type: [StockByUnitSchema],
      default: []
    },
    description: {
      type: String,
      default: ''
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

module.exports = mongoose.model('ChildProduct', ChildProductSchema);
