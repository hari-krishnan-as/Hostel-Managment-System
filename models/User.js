const mongoose = require("mongoose");

const loginSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  department: { type: String, required: true, trim: true },
  semester: { type: Number, required: true, min: 1, max: 10 },
  hostelid: { type: String, required: true, unique: true, trim: true },
  password: { type: String, required: true },
  role: { type: String, enum: ["student", "admin"], default: "student" },
  registrationDate: { type: Date, required: true },
  isApproved: { type: Boolean, default: false },

  // ✅ Leave tracking
  leaves: [
    {
      from: { type: Date, required: true },
      to: { type: Date, required: true }
    }
  ],

  // ✅ Complaints
  complaints: [
    {
      text: { type: String, required: true, trim: true },
      date: { type: Date, default: Date.now },
      status: { type: String, default: "Pending" }
    }
  ],

  // ✅ Suggestions
  suggestions: [
    {
      text: { type: String, required: true, trim: true }
    }
  ],

});

const User = mongoose.models.user || mongoose.model("user", loginSchema);
module.exports = User;


