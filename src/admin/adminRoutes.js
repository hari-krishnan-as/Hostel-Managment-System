const express = require("express");
const User = require("../../models/User"); // ✅ import User model
const router = express.Router();

// Middleware: check login
const isAuthenticated = (req, res, next) => {
  if (req.session.userId) next();
  else res.redirect("/login");
};

// Admin Dashboard
router.get("/dashboard", isAuthenticated, async (req, res) => {
  try {
    const foundUser = await User.findOne({ hostelid: req.session.userId });

    if (foundUser && foundUser.role === "admin") {
      res.render("admin/admin_dashboard", { name: foundUser.name });
    } else {
      res.redirect("/login");
    }
  } catch (err) {
    console.error("Error fetching admin:", err);
    res.redirect("/login");
  }
});

// Admin - Pending Users
router.get("/pending-users", isAuthenticated, async (req, res) => {
  try {
    const admin = await User.findOne({ hostelid: req.session.userId });
    if (!admin || admin.role !== "admin") return res.redirect("/login");

    const pendingUsers = await User.find({ isApproved: false });
    res.render("admin/pending-users", { pendingUsers }); // ✅ Corrected line
  } catch (err) {
    console.error("Error fetching pending users:", err);
    res.status(500).send("Error loading pending users");
  }
});

// ...



// Approve a user
router.post("/approve/:id", async (req, res) => {
  await User.findByIdAndUpdate(req.params.id, { isApproved: true });
  res.redirect("/admin/pending-users");
});


module.exports = router;