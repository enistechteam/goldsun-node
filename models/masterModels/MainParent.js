const mongoose = require("mongoose");

const ParentProductSchema = new mongoose.Schema(
  {
    parentProductId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ParentProduct",
      required: true
    },
    quantity: {
      type: Number,
      required: true
    }
  },
  { _id: false }
);

const MainParentProductSchema = new mongoose.Schema(
  {
    mainParentProductCode: {
      type: String,
      required: true,
      unique: true,
      trim: true
    },
    mainParentProductName: {
      type: String,
      required: true,
      trim: true
    },
    parentProducts: [ParentProductSchema],
    stockByUnit: [
      {
        unitId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Unit",
          required: true
        },
        totalMPQuantity: {
          type: Number,
          required: true,
          default: 0
        },
        committedMPQuantity: {
          type: Number,
          required: true,
          default: 0
        },
        availableToCommitMPQuantity: {
          type: Number,
          required: true,
          default: 0
        }
      }
    ],
    description: {
      type: String,
      default: ""
    },
    isActive: {
      type: Boolean,
      default: true
    }
  },
  { timestamps: true }
);

MainParentProductSchema.index({ "stockByUnit.unitId": 1 });
MainParentProductSchema.index({ "parentProducts.parentProductId": 1 });
MainParentProductSchema.index({ "isActive": 1 });
MainParentProductSchema.index({ "mainParentProductCode": 1 });

module.exports = mongoose.model("MainParentProduct", MainParentProductSchema);
