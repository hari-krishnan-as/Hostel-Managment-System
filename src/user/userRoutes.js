const express = require("express");
const User = require("../../models/User");
const router = express.Router();
const bcrypt = require("bcrypt");

// ---------------- Middleware ----------------
const isAuthenticated = (req, res, next) => {
  if (req.session.userId) next();
  else res.redirect("/login");
};

// ---------------- Utility: Attendance ----------------
function calculateAttendanceDays(registrationDate, leaves = []) {
  const today = new Date();
  const regDate = new Date(registrationDate);

  const totalDays = Math.floor((today - regDate) / (1000 * 60 * 60 * 24)) + 1;

  let offDays = 0;
  leaves.forEach((leave) => {
    const from = new Date(leave.from);
    const to = new Date(leave.to);
    const diff = Math.floor((to - from) / (1000 * 60 * 60 * 24)) + 1;
    offDays += diff;
  });

  const presentDays = totalDays - offDays;
  return { presentDays, offDays };
}
// ---------------- Routes ----------------

// Dashboard
router.get("/dashboard", isAuthenticated, async (req, res) => {
  const foundUser = await User.findOne({ hostelid: req.session.userId });
  if (foundUser) res.render("user/student_dashboard", { user: foundUser });
  else res.redirect("/login");
});

// Profile
router.get("/profile", isAuthenticated, async (req, res) => {
  const foundUser = await User.findOne({ hostelid: req.session.userId });
  if (!foundUser) return res.redirect("/login");

  res.render("user/profile", { user: foundUser });
});

// Attendance
router.get("/attendance", isAuthenticated, async (req, res) => {
  const foundUser = await User.findOne({ hostelid: req.session.userId });
  if (!foundUser) return res.redirect("/login");

  const { presentDays, offDays } = calculateAttendanceDays(
    foundUser.registrationDate,
    foundUser.leaves || []
  );

  res.render("user/attendance", {
    user: foundUser,
    presentDays,
    offDays,
  });
});

// Mess Cut
router.get("/mess-cut", isAuthenticated, async (req, res) => {
  const foundUser = await User.findOne({ hostelid: req.session.userId });
  if (!foundUser) return res.redirect("/login");

  res.render("user/mess-cut", { user: foundUser });
});

router.post("/apply-mess-cut", isAuthenticated, async (req, res) => {
  const { startDate, endDate } = req.body;
  const foundUser = await User.findOne({ hostelid: req.session.userId });
  if (!foundUser) return res.redirect("/login");

  foundUser.leaves.push({ from: new Date(startDate), to: new Date(endDate) });
  await foundUser.save();

  res.send(
    "<script>alert('Mess cut leave applied successfully'); window.location.href='/user/mess-cut';</script>"
  );
});

// Complaints
router.get("/complaints", isAuthenticated, async (req, res) => {
  const foundUser = await User.findOne({ hostelid: req.session.userId });
  res.render("user/complaints", { user: foundUser });
});

router.post("/complaints", isAuthenticated, async (req, res) => {
  const { complaint } = req.body;
  const foundUser = await User.findOne({ hostelid: req.session.userId });
  foundUser.complaints.push({ text: complaint, date: new Date(), status: "Pending" });
  await foundUser.save();

  res.send(
    "<script>alert('Complaint submitted successfully'); window.location.href='/user/complaints';</script>"
  );
});

// Suggestions
router.get("/suggestions", isAuthenticated, async (req, res) => {
  const foundUser = await User.findOne({ hostelid: req.session.userId });
  res.render("user/suggestions", { user: foundUser });
});

router.post("/suggestions", isAuthenticated, async (req, res) => {
  const { suggestion } = req.body;
  const foundUser = await User.findOne({ hostelid: req.session.userId });
  foundUser.suggestions.push({ text: suggestion });
  await foundUser.save();

  res.send(
    "<script>alert('Suggestion submitted successfully'); window.location.href='/user/suggestions';</script>"
  );
});

// Settings (Change Password)
router.get("/settings", isAuthenticated, (req, res) => res.render("user/settings"));

router.post("/change-password", isAuthenticated, async (req, res) => {
  const { oldPassword, newPassword, confirmPassword } = req.body;
  const foundUser = await User.findOne({ hostelid: req.session.userId });

  if (!foundUser) return res.redirect("/login");
  if (newPassword !== confirmPassword) {
    return res.send(
      "<script>alert('Passwords do not match'); window.location.href='/user/settings';</script>"
    );
  }

  const isPasswordMatch = await bcrypt.compare(oldPassword, foundUser.password);
  if (!isPasswordMatch) {
    return res.send(
      "<script>alert('Old password is incorrect'); window.location.href='/user/settings';</script>"
    );
  }

  foundUser.password = await bcrypt.hash(newPassword, 10);
  await foundUser.save();

  res.send(
    "<script>alert('Password changed successfully'); window.location.href='/user/settings';</script>"
  );
});

// Notifications
router.get("/notifications", isAuthenticated, async (req, res) => {
  const foundUser = await User.findOne({ hostelid: req.session.userId });
  res.render("user/notifications", { user: foundUser });
});

module.exports = router;