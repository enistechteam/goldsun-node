const Unit = require('../../models/masterModels/Unit');


exports.createUnit = async (req, res) => {
    try {
        const { UnitName, UnitLocation, UnitAddress, isDispatchEnabled, isActive } = req.body;

        const existingUnit = await Unit.findOne({ UnitName });
        if (existingUnit) {
            return res.status(400).json({ message: 'Unit with this name already exists' });
        }

        const unit = new Unit({
            UnitName,
            UnitLocation,
            UnitAddress,
            isDispatchEnabled,
            isActive
        });

        await unit.save();

        res.status(200).json({
            message: 'Unit created successfully',
            data: unit._id
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.getAllUnits = async (req, res) => {
    try {
        const units = await Unit.find().sort({ createdAt: -1 });
        res.status(200).json(units);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.getUnitByName = async (req, res) => {
    try {
        const unit = await Unit.findOne({ UnitName: req.params.UnitName });

        if (!unit) {
            return res.status(400).json({ message: 'Unit not found' });
        }

        res.status(200).json(unit);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.updateUnit = async (req, res) => {
    try {
        const { _id, UnitName, UnitLocation, UnitAddress, isDispatchEnabled, isActive } = req.body;

        const unit = await Unit.findByIdAndUpdate(
            _id,
            { UnitName, UnitLocation, UnitAddress, isDispatchEnabled, isActive },
            { new: true, runValidators: true }
        );

        if (!unit) {
            return res.status(400).json({ message: 'Unit not found' });
        }

        res.status(200).json({ message: 'Unit updated successfully', data: unit });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.deleteUnit = async (req, res) => {
    try {
        const { _id } = req.body;

        const unit = await Unit.findByIdAndUpdate(
            _id,
            { isActive: false },
            { new: true }
        );

        if (!unit) {
            return res.status(400).json({ message: 'Unit not found' });
        }

        res.status(200).json({ message: 'Unit deactivated successfully' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
