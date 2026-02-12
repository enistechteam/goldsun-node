// models/MenuRegistry.js
const mongoose = require('mongoose');

const menuRegistrySchema = new mongoose.Schema({
  formId: {
    type: String,
    required: true,
    unique: true
  },
  title: {
    type: String,
    required: true
  },
  parentFormId: {
    type: String,
    default: null
  },
  actions: {
    type: [String],
    default: []
  },
  unitAccess: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Unit'
    }
  ],
  isActive: {
    type: Boolean,
    default: true
  },
  sortOrder: {
    type: Number,
    default: 0
  },
  UnitId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Unit"
  },
}, { timestamps: true });

module.exports = mongoose.model('MenuRegistry', menuRegistrySchema);
