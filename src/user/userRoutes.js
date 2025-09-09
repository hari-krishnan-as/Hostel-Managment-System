const express = require("express");
const bcrypt = require("bcrypt");
const collection = require("../config"); // mongoose model
const router = express.Router();

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
  const user = await collection.findOne({ hostelid: req.session.userId });
  if (user) res.render("user/student_dashboard", { name: user.name });
  else res.redirect("/login");
});

// Profile
router.get("/profile", isAuthenticated, async (req, res) => {
  const user = await collection.findOne({ hostelid: req.session.userId });
  if (!user) return res.redirect("/login");

  res.render("user/profile", {
    name: user.name,
    department: user.department,
    semester: user.semester,
    hostelid: user.hostelid,
    role: user.role,
    registrationDate: user.registrationDate.toDateString(),
  });
});

// Attendance
router.get("/attendance", isAuthenticated, async (req, res) => {
  const user = await collection.findOne({ hostelid: req.session.userId });
  if (!user) return res.redirect("/login");

  const { presentDays, offDays } = calculateAttendanceDays(
    user.registrationDate,
    user.leaves || []
  );

  res.render("user/attendance", {
    name: user.name,
    presentDays,
    offDays,
    leaves: user.leaves || [],
  });
});

// Mess Cut
router.get("/mess-cut", isAuthenticated, async (req, res) => {
  const user = await collection.findOne({ hostelid: req.session.userId });
  if (!user) return res.redirect("/login");

  res.render("user/mess-cut", { name: user.name, leaves: user.leaves || [] });
});

router.post("/apply-mess-cut", isAuthenticated, async (req, res) => {
  const { startDate, endDate } = req.body;
  const user = await collection.findOne({ hostelid: req.session.userId });
  if (!user) return res.redirect("/login");

  user.leaves.push({ from: new Date(startDate), to: new Date(endDate) });
  await user.save();

  res.send(
    "<script>alert('Mess cut leave applied successfully'); window.location.href='/user/mess-cut';</script>"
  );
});

// Complaints
router.get("/complaints", isAuthenticated, async (req, res) => {
  const user = await collection.findOne({ hostelid: req.session.userId });
  res.render("user/complaints", {
    name: user.name,
    complaints: user.complaints || [],
  });
});

router.post("/complaints", isAuthenticated, async (req, res) => {
  const { complaint } = req.body;
  const user = await collection.findOne({ hostelid: req.session.userId });
  user.complaints.push({ text: complaint, date: new Date(), status: "Pending" });
  await user.save();

  res.send(
    "<script>alert('Complaint submitted successfully'); window.location.href='/user/complaints';</script>"
  );
});

// Suggestions
router.get("/suggestions", isAuthenticated, async (req, res) => {
  const user = await collection.findOne({ hostelid: req.session.userId });
  res.render("user/suggestions", {
    name: user.name,
    suggestions: user.suggestions || [],
  });
});

router.post("/suggestions", isAuthenticated, async (req, res) => {
  const { suggestion } = req.body;
  const user = await collection.findOne({ hostelid: req.session.userId });
  user.suggestions.push({ text: suggestion });
  await user.save();

  res.send(
    "<script>alert('Suggestion submitted successfully'); window.location.href='/user/suggestions';</script>"
  );
});

// Settings (Change Password)
router.get("/settings", isAuthenticated, (req, res) =>
  res.render("user/settings")
);

router.post("/change-password", isAuthenticated, async (req, res) => {
  const { oldPassword, newPassword, confirmPassword } = req.body;
  const user = await collection.findOne({ hostelid: req.session.userId });

  if (!user) return res.redirect("/login");
  if (newPassword !== confirmPassword) {
    return res.send(
      "<script>alert('Passwords do not match'); window.location.href='/user/settings';</script>"
    );
  }

  const isPasswordMatch = await bcrypt.compare(oldPassword, user.password);
  if (!isPasswordMatch) {
    return res.send(
      "<script>alert('Old password is incorrect'); window.location.href='/user/settings';</script>"
    );
  }

  user.password = await bcrypt.hash(newPassword, 10);
  await user.save();

  res.send(
    "<script>alert('Password changed successfully'); window.location.href='/user/settings';</script>"
  );
});

module.exports = router;
