const mongoose = require('mongoose');

const ParentProductSchema = new mongoose.Schema(
  {
    parentProductCode: {
      type: String,
      required: true,
      unique: true,
      trim: true
    },
    parentProductName: {
      type: String,
      required: true,
      trim: true
    },
    childProducts: [
      {
        childProductId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'ChildProduct',
        },
        quantity: {
          type: Number,
        } // prevent creating extra _id for each subdoc
      },
       { _id: false } // prevent creating extra _id for each subdoc
    ],
    stockByUnit: [
      {
        unitId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Unit',
          required: true
        },
        totalPPQuantity: {
          type: Number,
          required: true,
          default: 0
        },
        committedPPQuantity: {
          type: Number,
          required: true,
          default: 0
        },
        availableToCommitPPQuantity: {
          type: Number,
          required: true,
          default: 0
        }
      }
    ],
    description: {
      type: String,
      default: ''
    },
    isActive: {
      type: Boolean,
      default: true
    }
  },
  { timestamps: true }
);

ParentProductSchema.index({ "stockByUnit.unitId": 1 });
ParentProductSchema.index({ _id: 1, "stockByUnit.unitId": 1 });

module.exports = mongoose.model('ParentProduct', ParentProductSchema);
