const express = require("express");
const router = express.Router();
const User = require("../../models/User");
const Notification = require("../../models/notification");

// Middleware: check login
const isAuthenticated = (req, res, next) => {
  if (req.session.userId) next();
  else res.redirect("/login");
};

// Admin Dashboard
router.get("/dashboard", isAuthenticated, async (req, res) => {
  const admin = await User.findOne({ hostelid: req.session.userId });
  if (admin && admin.role === "admin") {
    res.render("admin/admin_dashboard", { name: admin.name });
  } else {
    res.redirect("/login");
  }
});

// Pending Users
router.get("/pending-users", isAuthenticated, async (req, res) => {
  const admin = await User.findOne({ hostelid: req.session.userId });
  if (!admin || admin.role !== "admin") return res.redirect("/login");

  const pendingUsers = await User.find({ isApproved: false });
  res.render("admin/pending-users", { pendingUsers });
});

// Approve user
router.post("/approve/:id", isAuthenticated, async (req, res) => {
  await User.findByIdAndUpdate(req.params.id, { isApproved: true });
  res.redirect("/admin/pending-users");
});

// Expense Log
router.get("/expense-log", isAuthenticated, (req, res) => {
  res.render("admin/expense-log");
});

// Approve Mess Cut
router.get("/approve-messcut", isAuthenticated, async (req, res) => {
  const admin = await User.findOne({ hostelid: req.session.userId });
  if (!admin || admin.role !== "admin") return res.redirect("/login");

  const users = await User.find({ "leaves.approved": false });
  const messCuts = [];
  users.forEach(user => {
    user.leaves.forEach(leave => {
      if (!leave.approved) {
        messCuts.push({
          _id: leave._id,
          userId: user._id,
          name: user.name,
          hostelid: user.hostelid,
          from: leave.from.toDateString(),
          to: leave.to.toDateString(),
          status: "Pending"
        });
      }
    });
  });
  res.render("admin/approve-messcut", { messCuts });
});

// Approve a specific mess cut request
router.post("/approve-messcut/:id", isAuthenticated, async (req, res) => {
  await User.updateOne(
    { "leaves._id": req.params.id },
    { $set: { "leaves.$.approved": true } }
  );
  res.redirect("/admin/approve-messcut");
});

// View complaints
router.get("/view-complaint", isAuthenticated, async (req, res) => {
  const users = await User.find({ "complaints.0": { $exists: true } }, { name: 1, hostelid: 1, complaints: 1 });
  res.render("admin/view-complaint", { users });
});

// Update complaint
router.post("/update-complaint/:userId/:complaintId", isAuthenticated, async (req, res) => {
  const { userId, complaintId } = req.params;
  const { status } = req.body;

  await User.findOneAndUpdate(
    { _id: userId, "complaints._id": complaintId },
    { $set: { "complaints.$.status": status } }
  );
  res.redirect("/admin/view-complaint");
});

// View suggestions
router.get("/view-suggestion", isAuthenticated, async (req, res) => {
  const users = await User.find({ "suggestions.0": { $exists: true } }, "name hostelid suggestions");
  res.render("admin/view-suggestion", { users });
});

// Give notification page
router.get("/give-notification", isAuthenticated, async (req, res) => {
  const notifications = await Notification.find().sort({ _id: -1 });
  res.render("admin/give-notification", { notifications });
});

// POST notification
router.post("/give-notification", isAuthenticated, async (req, res) => {
  const { message } = req.body;
  await Notification.create({ message });
  res.redirect("/admin/give-notification");
});

// Delete notification
router.post("/delete-notification/:id", isAuthenticated, async (req, res) => {
  await Notification.findByIdAndDelete(req.params.id);
  res.redirect("/admin/give-notification");
});

module.exports = router;
