const mongoose = require('mongoose');

const DepartmentSchema = new mongoose.Schema(
  {
    unitId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Unit',
      required: true
    },
    DepartmentCode: {
      type: String,
      unique: true,
      trim: true
    },
    DepartmentName: {
      type: String,
      required: true,
      trim: true,
      minlength: [2, 'Department name must be at least 2 characters long'],
      maxlength: [100, 'Department name cannot exceed 100 characters']
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

const Department = mongoose.model('Department', DepartmentSchema);

module.exports = Department;
