const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema({
  message: {
    type: String,
    required: true,
  },
  createdAt: {
    type: String,
    default: () => new Date().toLocaleString("en-IN", { 
      dateStyle: "medium", 
      timeStyle: "short" 
    }) // formats like: 20 Sep 2025, 9:30 PM
  }
});

module.exports = mongoose.model("Notification", notificationSchema);
