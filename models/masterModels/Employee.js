const mongoose = require('mongoose');

const EmployeeSchema = new mongoose.Schema(
  {
    unitId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Unit',
      required: true
    },
    departmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Department',
      required: true
    },
    EmployeeName: {
      type: String,
      required: true,
      trim: true,
      minlength: [2, 'Employee name must be at least 2 characters'],
      maxlength: [100, 'Employee name cannot exceed 100 characters']
    },
    EmployeeCode: {
      type: String,
      required: true,
      unique: true,
      trim: true
    },
    password: {
      type: String,
      required: true,
      minlength: [6, 'Password must be at least 6 characters']
    },
    role: {
      type: String,
      enum: ['superadmin','admin', 'employee'],
      required: true
    },
    canViewAllUnits: {
      type: Boolean,
      default: false
    },
    isActive: {
      type: Boolean,
      default: true
    },
    isLoggedIn: {
      type: Boolean,
      default: false
    },
    lastLogin: {
      type: Date,
      default: null 
    },
  },
  {
    timestamps: true 
  }
);

const Employee = mongoose.model('Employee', EmployeeSchema);
module.exports = Employee;
