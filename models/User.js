const mongoose = require("mongoose");

const loginSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    department: { type: String, required: true, trim: true },
    semester: { type: Number, required: true, min: 1, max: 10 },
    hostelid: { type: String, required: true, unique: true, trim: true },
    password: { type: String, required: true },

    role: { type: String, enum: ["student", "admin"], default: "student" },
    registrationDate: { type: Date, default: Date.now },
    isApproved: { type: Boolean, default: false },

    // ✅ Leave tracking
    leaves: [
      {
        from: { type: Date, required: true },
        to: { type: Date, required: true },
        approved: { type: Boolean, default: false },
        appliedOn: { type: Date, default: Date.now }
      }
    ],

    // ✅ Complaints
    complaints: [
      {
        text: { type: String, required: true, trim: true },
        date: { type: Date, default: Date.now },
        status: { type: String, enum: ["Pending", "Resolved", "Rejected"], default: "Pending" }
      }
    ],

    // ✅ Suggestions
    suggestions: [
      {
        text: { type: String, required: true, trim: true },
        date: { type: Date, default: Date.now }
      }
    ]
  },
  { timestamps: true } // adds createdAt, updatedAt automatically
);

const User = mongoose.models.User || mongoose.model("User", loginSchema);
module.exports = User;
