const Customer = require('../../models/masterModels/Customer');
const mongoose = require('mongoose');

// Create Customer
exports.createCustomer = async (req, res) => {
  try {
    const {
      unitId,
      customerName,
      customerEmail,
      customerPassword,
      customerMobile,
      customerPhone,
      customerAddress,
      customerCity,
      customerCity1,
      customerBranch1,
      customerCity2,
      customerBranch2,
      customerCity3,
      customerBranch3,
      customerState,
      customerZipCode,
      isActive
    } = req.body;

    const existing = await Customer.findOne({ customerEmail, unitId });
    if (existing) return res.status(400).json({ message: 'Customer already exists' });

    const lastCustomer = await Customer.findOne({ customerCode: { $regex: /^CU\d{7}$/ } })
      .sort({ customerCode: -1 })
      .collation({ locale: 'en', numericOrdering: true });

    let customerCode = 'CU0000001';
    if (lastCustomer && lastCustomer.customerCode) {
      const numericPart = parseInt(lastCustomer.customerCode.slice(2));
      const nextNumber = numericPart + 1;
      customerCode = `CU${nextNumber.toString().padStart(7, '0')}`;
    }

    const newCustomer = new Customer({
      unitId,
      customerCode,
      customerName,
      customerEmail,
      customerPassword,
      customerMobile,
      customerPhone,
      customerAddress,
      customerCity,
      customerCity1,
      customerBranch1,
      customerCity2,
      customerBranch2,
      customerCity3,
      customerBranch3,
      customerState,
      customerZipCode,
      isActive
    });

    await newCustomer.save();
    res.status(200).json({ message: 'Customer created successfully', data: newCustomer._id });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get All Customers
exports.getAllCustomers = async (req, res) => {
  try {
    const { unitId } = req.body;
    const matchStage = { isActive: true, unitId: new mongoose.Types.ObjectId(unitId) };

    const customers = await Customer.aggregate([
      { $match: matchStage },
      {
        $lookup: {
          from: 'units',
          localField: 'unitId',
          foreignField: '_id',
          as: 'unit'
        }
      },
      { $unwind: { path: '$unit', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 1,
          customerCode: 1,
          customerName: 1,
          customerPassword: 1,
          customerEmail: 1,
          customerMobile: 1,
          customerPhone: 1,
          customerAddress: 1,
          customerCity: 1,
          customerCity1: 1,
          customerBranch1: 1,
          customerCity2: 1,
          customerBranch2: 1,
          customerCity3: 1,
          customerBranch3: 1,
          customerState: 1,
          customerZipCode: 1,
          isActive: 1,
          unitId: '$unit._id',
          unitName: '$unit.name',
          createdAt: 1,
          updatedAt: 1
        }
      },
      { $sort: { createdAt: -1 } }
    ]);

    res.status(200).json(customers);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Update Customer
exports.updateCustomer = async (req, res) => {
  try {
    const { _id } = req.body;
    if (!_id) return res.status(400).json({ message: 'ID is required' });

    const updateData = {};

    const fields = [
      'unitId', 'customerName', 'customerEmail', 'customerPassword',
      'customerMobile', 'customerPhone', 'customerAddress',
      'customerCity', 'customerCity1', 'customerBranch1',
      'customerCity2', 'customerBranch2', 'customerCity3',
      'customerBranch3', 'customerState', 'customerZipCode', 'isActive'
    ];

    for (const field of fields) {
      if (req.body[field] !== undefined) updateData[field] = req.body[field];
    }

    const updated = await Customer.findByIdAndUpdate(
      _id,
      updateData,
      { new: true, runValidators: true }
    );

    if (!updated) return res.status(400).json({ message: 'Customer not found' });

    res.status(200).json({ message: 'Customer updated successfully', data: updated });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Delete (Deactivate) Customer
exports.deleteCustomer = async (req, res) => {
  try {
    const { _id } = req.body;

    const deleted = await Customer.findByIdAndUpdate(_id, { isActive: false }, { new: true });
    if (!deleted) return res.status(400).json({ message: 'Customer not found' });

    res.status(200).json({ message: 'Customer deactivated successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
