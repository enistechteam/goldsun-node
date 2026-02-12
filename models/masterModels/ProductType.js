const mongoose = require('mongoose');

const ProductTypeSchema = new mongoose.Schema(
  {
    unitId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Unit',
      required: true
    },
    productTypeCode: {
      type: String,
      required: true,
      unique: true,
      trim: true
    },
    productTypeName: {
      type: String,
      required: true,
      trim: true
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

module.exports = mongoose.model('ProductType', ProductTypeSchema);
