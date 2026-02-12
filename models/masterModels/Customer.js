const mongoose = require('mongoose');

const CustomerSchema = new mongoose.Schema(
  {
    unitId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Unit',
      required: true
    },
    customerCode: {
      type: String,
      required: true,
      unique: true,
      trim: true
    },
    customerName: {
      type: String,
      required: true,
      trim: true
    },
    customerEmail: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true
    },
    customerPassword: {
      type: String,
      required: true
    },
    customerMobile: {
      type: String,
      required: true,
      trim: true
    },
    customerPhone: {
      type: String,
      trim: true
    },
    customerAddress: {
      type: String,
      trim: true
    },
    customerCity: {
      type: String,
      trim: true
    },
    customerCity1: {
      type: String,
      trim: true
    },
    customerBranch1: {
      type: String,
      trim: true
    },
    customerCity2: {
      type: String,
      trim: true
    },
    customerBranch2: {
      type: String,
      trim: true
    },
    customerCity3: {
      type: String,
      trim: true
    },
    customerBranch3: {
      type: String,
      trim: true
    },
    customerState: {
      type: String,
      trim: true
    },
    customerZipCode: {
      type: String,
      trim: true
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

module.exports = mongoose.model('Customer', CustomerSchema);
