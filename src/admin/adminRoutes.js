const express = require("express");
const collection = require("../../config.js");
const router = express.Router();

// Middleware: check login
const isAuthenticated = (req, res, next) => {
  if (req.session.userId) next();
  else res.redirect("/login");
};

// Admin Dashboard
router.get("/dashboard", isAuthenticated, async (req, res) => {
  const user = await collection.findOne({ hostelid: req.session.userId });
  if (user && user.role === "admin") {
    res.render("admin/admin_dashboard", { name: user.name });
  } else {
    res.redirect("/login");
  }
});

module.exports = router;
