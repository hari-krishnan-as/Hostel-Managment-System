const mongoose = require('mongoose');

// connect to DB
mongoose.connect("mongodb://localhost:27017/login")
  .then(() => {
    console.log("Database connected successfully");
  })
  .catch((err) => {
    console.error("Database not connected:", err);
  });

// create schema
const loginSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  department: {
    type: String,
    required: true
  },
  semester: {
    type: Number,
    required: true
  },
  hostelid: {
    type: String, 
    required: true
  },
  password: {
    type: String,
    required: true
  },
  role: {                // 👈 NEW FIELD
        type: String,
        enum: ["student", "admin"],
        default: "student"
    }
});

// collection part
const collection = mongoose.model("users", loginSchema);

module.exports = collection;
