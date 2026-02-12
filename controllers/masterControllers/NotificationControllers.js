const Notification = require("../../models/masterModels/Notifications");

exports.createNotification = async (req, res) => {
  try {
    const { unitId, message } = req.body;

    if (!unitId || !message) {
      return res.status(400).json({
        message: "unitId and message are required.",
      });
    }

    const notification = new Notification({
      unitId,
      message,
    });

    await notification.save();

    res.status(201).json({
      message: "Notification saved successfully.",
      data: notification,
    });
  } catch (error) {
    console.error("Error saving notification:", error.message);
    res.status(500).json({
      message: "Failed to save notification.",
      error: error.message,
    });
  }
};

exports.getNotificationsByUnit = async (req, res) => {
  try {
    const { unitId } = req.body;

    if (!unitId) {
      return res.status(400).json({
        message: "unitId is required.",
      });
    }

    const notifications = await Notification.find({ unitId })
      .sort({ createdAt: -1 });

    res.status(200).json({
      message: "Notifications fetched successfully.",
      data: notifications,
    });
  } catch (error) {
    console.error("Error fetching notifications:", error.message);
    res.status(500).json({
      message: "Failed to fetch notifications.",
      error: error.message,
    });
  }
};
