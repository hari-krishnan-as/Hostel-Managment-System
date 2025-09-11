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

module.exports = router;
