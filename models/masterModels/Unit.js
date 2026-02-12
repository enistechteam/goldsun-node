const mongoose = require('mongoose');

// Define the Unit Schema
const UnitSchema = new mongoose.Schema(
  {
    UnitName: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      minlength: [2, 'Unit name must be at least 2 characters long'],
      maxlength: [50, 'Unit name cannot exceed 50 characters']
    },
    UnitLocation: {
      type: String,
      required: false,
      trim: true,
      maxlength: [50, 'Location cannot exceed 50 characters']
    },
    UnitAddress: {
      type: String,
      required: false,
      trim: true,
      maxlength: [200, 'Address cannot exceed 200 characters']
    },
    isDispatchEnabled: {
      type: Boolean,
      default: false
    },
    isActive: {
      type: Boolean,
      default: true
    }
  },
  {
    timestamps: true // Adds createdAt and updatedAt
  }
);

const Unit = mongoose.model('Unit', UnitSchema);

module.exports = Unit;
