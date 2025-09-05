const mongoose = require('mongoose');

// ✅ Connect to MongoDB
mongoose.connect("mongodb://localhost:27017/login", {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => {
  console.log("Database connected successfully");
})
.catch((err) => {
  console.error("Database connection failed:", err);
});

// ✅ Schema definition
const loginSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  department: {
    type: String,
    required: true,
    trim: true
  },
  semester: {
    type: Number,
    required: true,
    min: 1,
    max: 10
  },
  hostelid: {
    type: String, 
    required: true,
    unique: true
  },
  password: {
    type: String,
    required: true
  },
  role: {                
    type: String,
    enum: ["student", "admin"],
    default: "student"
  },
  registrationDate: {   
    type: Date,
    required: true
  },

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
      text: { type: String, required: true },
      date: { type: Date, default: Date.now },
      status: { type: String, default: "Pending" }
    }
  ],

  // ✅ Suggestions
  suggestions: [
    {
      text: { type: String, required: true, trim: true }
    }
  ]
});

// ✅ Collection (Model)
const User = mongoose.model("users", loginSchema);
module.exports = User;
