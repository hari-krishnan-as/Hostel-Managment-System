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

// Approve a user
router.post("/approve/:id", async (req, res) => {
  await User.findByIdAndUpdate(req.params.id, { isApproved: true });
  res.redirect("/admin/pending-users");
});
router.get("/expense-log", isAuthenticated, (req, res) => {
  res.render("admin/expense-log");
});


// View Mess Cut Approvals
router.get("/approve-messcut", isAuthenticated, async (req, res) => {
  try {
    const admin = await User.findOne({ hostelid: req.session.userId });
    if (!admin || admin.role !== "admin") return res.redirect("/login");

    // Get all users with at least one pending leave
    const users = await User.find({ "leaves.approved": false });

    // Flatten into table-friendly array
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
  } catch (err) {
    console.error("Error fetching mess cuts:", err);
    res.status(500).send("Error loading mess cut requests");
  }
});

// Approve a specific mess cut request
// Approve a specific mess cut request
router.post("/approve-messcut/:id", isAuthenticated, async (req, res) => {
  try {
    const admin = await User.findOne({ hostelid: req.session.userId });
    if (!admin || admin.role !== "admin") return res.redirect("/login");

    await User.updateOne(
      { "leaves._id": req.params.id },
      { $set: { "leaves.$.approved": true } }
    );

    res.redirect("/admin/approve-messcut"); // ✅ admin stays on approval page
  } catch (err) {
    console.error("Error approving mess cut:", err);
    res.status(500).send("Error approving mess cut");
  }
});



module.exports = router;