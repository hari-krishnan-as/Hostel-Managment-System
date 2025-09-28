const express = require("express");
const path = require("path");
const session = require("express-session");
const hbs = require("hbs");
const bcrypt = require("bcrypt");
require("dotenv").config();

// Import DB connection and models
const connectDB = require("./config");
const User = require("./models/User.js");

// Import routes
const adminRoutes = require("./src/admin/adminRoutes");
const { router: userRoutes, notificationMiddleware } = require("./src/user/userRoutes"); // ✅ only once

const app = express();

// Connect to DB
connectDB();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Session setup
app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false },
  })
);

// Views setup
app.set("view engine", "hbs");
app.set("views", path.join(__dirname, "views"));
app.use(express.static(path.join(__dirname, "public")));

// Handlebars helpers
hbs.registerHelper("calcDays", (from, to) => {
  const start = new Date(from);
  const end = new Date(to);
  if (isNaN(start) || isNaN(end)) return "N/A";
  return Math.floor((end - start) / (1000 * 60 * 60 * 24)) + 1;
});

hbs.registerHelper("eq", function (a, b) {
  return a === b;
});

// Default public routes
app.get("/", (req, res) => res.render("home"));
app.get("/login", (req, res) => res.render("login"));
app.get("/request", (req, res) => res.render("request"));
app.get("/about", (req, res) => res.render("about"));
app.get("/contact", (req, res) => res.render("contact"));

// Redirect to correct attendance page
app.get("/attendance", (req, res) => res.redirect("/user/attendance"));

// Register user
app.post("/request", async (req, res) => {
  try {
    const data = {
      name: req.body.name,
      department: req.body.department,
      semester: req.body.semester,
      hostelid: req.body.hostelid,
      program: req.body.program, 
      password: await bcrypt.hash(req.body.password, 10),
      role: req.body.role || "student",
      registrationDate: req.body.registrationDate,
    };
    
    // Check if user already exists
    const existingUser = await User.findOne({ hostelid: data.hostelid });
    if (existingUser) {
      return res.send("<script>alert('Hostelid already exists.'); window.location.href='/request';</script>");
    }

    // Create the user (Mongoose validation and default values run here)
    await User.create(data);
    res.redirect("/login");

  } catch (err) {
    // Log the error for server-side debugging
    console.error("Error creating user:", err.message);
    
    // Send a generic error response to the client
    res.status(500).send("Internal Server Error");
  }
});

// Login user
app.post("/login", async (req, res) => {
  try {
    const user = await User.findOne({ hostelid: req.body.hostelid });
    if (!user) {
      return res.send("<script>alert('User not found'); window.location.href='/login';</script>");
    }

    const isMatch = await bcrypt.compare(req.body.password, user.password);
    if (!isMatch) {
      return res.send("<script>alert('Wrong Password'); window.location.href='/login';</script>");
    }

    if (!user.isApproved) {
      return res.send("<script>alert('Your account is pending admin approval.'); window.location.href='/login';</script>");
    }

    req.session.userId = user.hostelid;
    if (user.role === "admin") return res.redirect("/admin/dashboard");
    else return res.redirect("/user/dashboard");
  } catch (err) {
    console.error("Login error:", err.message);
    res.status(500).send("Internal Server Error");
  }
});

// Logout
app.get("/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/"));
});

// Mount routes
app.use("/admin", adminRoutes);
app.use("/user", userRoutes); // ✅ pass only the router

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
