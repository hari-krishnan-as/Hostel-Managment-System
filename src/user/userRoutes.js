const express = require("express");
const User = require("../../models/User");
const router = express.Router();
const bcrypt = require("bcrypt");
const Notification = require("../../models/notification");

// ---------------- Middleware ----------------
const isAuthenticated = (req, res, next) => {
  if (req.session.userId) next();
  else res.redirect("/login");
};

// Middleware to get unseen count (used in all routes except notifications page)
async function notificationMiddleware(req, res, next) {
  try {
    const unseenCount = await Notification.countDocuments({ seen: false });
    res.locals.notificationCount = unseenCount; // 👈 available in all hbs
    next();
  } catch (err) {
    next(err);
  }
}

// ✅ Apply notification middleware to all routes in this router
router.use(notificationMiddleware);



// ---------------- Utility: Attendance ----------------
function calculateMonthlyAttendance(registrationDate, leaves = []) {
  const today = new Date();
  const regDate = new Date(registrationDate);

  // ✅ Define current monthly cycle based on registration date
  const currentMonth = today.getMonth();
  const currentYear = today.getFullYear();

  // Start of this month (from registration date's day or 1st of month if earlier)
  let cycleStart = new Date(currentYear, currentMonth, regDate.getDate());
  if (cycleStart > today) {
    // if registration day hasn’t come yet this month → use last month
    cycleStart = new Date(currentYear, currentMonth - 1, regDate.getDate());
  }

  // End of the cycle → one day before next cycleStart
  let cycleEnd = new Date(cycleStart);
  cycleEnd.setMonth(cycleEnd.getMonth() + 1);
  cycleEnd.setDate(cycleEnd.getDate() - 1);

  // If today is before cycleEnd → restrict end to today
  if (cycleEnd > today) cycleEnd = today;

  // ✅ Total days in current cycle
  const totalDays = Math.floor((cycleEnd - cycleStart) / (1000 * 60 * 60 * 24)) + 1;

  let messCutDays = 0;
  let waitingApprovalDays = 0;

  // ✅ Count leave days that overlap with current cycle
  leaves.forEach((leave) => {
    const leaveFrom = new Date(leave.from);
    const leaveTo = new Date(leave.to);

    // Clip leave interval to current cycle
    const from = leaveFrom < cycleStart ? cycleStart : leaveFrom;
    const to = leaveTo > cycleEnd ? cycleEnd : leaveTo;

    if (from <= to) {
      const diff = Math.floor((to - from) / (1000 * 60 * 60 * 24)) + 1;

      if (leave.approved) messCutDays += diff; // approved
      else waitingApprovalDays += diff;        // pending
    }
  });

  const presentDays = totalDays - messCutDays;

  return {
    cycleStart: cycleStart.toDateString(),
    cycleEnd: cycleEnd.toDateString(),
    presentDays,
    messCutDays,
    waitingApprovalDays,
    totalDays
  };
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

  const { presentDays, messCutDays, waitingApprovalDays } = calculateMonthlyAttendance(
    foundUser.registrationDate,
    foundUser.leaves || []
  );

  res.render("user/attendance", {
    name: foundUser.name,
    presentDays,
    messCutDays,
    waitingApprovalDays,
  });
});

// Apply Mess Cut
router.post("/apply-mess-cut", isAuthenticated, async (req, res) => {
  const { startDate, endDate } = req.body;
  const foundUser = await User.findOne({ hostelid: req.session.userId });
  if (!foundUser) return res.redirect("/login");

  foundUser.leaves.push({
    from: new Date(startDate),
    to: new Date(endDate),
    approved: false,    // ✅ ensure new requests are pending
  });
  await foundUser.save();

  res.redirect("/user/mess-cut");  // ✅ redirect to attendance → chart refreshes
});

// Mess Cut History
router.get("/mess-cut", isAuthenticated, async (req, res) => {
  const foundUser = await User.findOne({ hostelid: req.session.userId });
  if (!foundUser) return res.redirect("/login");

  res.render("user/mess-cut", { user: foundUser, messCuts: foundUser.leaves });
});

// complaint routes

// ✅ View complaints
router.get("/complaints", isAuthenticated, async (req, res) => {
  const foundUser = await User.findOne({ hostelid: req.session.userId });
  if (!foundUser) return res.redirect("/login");

  res.render("user/complaints", { 
    user: foundUser, 
    complaints: foundUser.complaints
  });
});

// ✅ Add complaint
router.post("/complaints", isAuthenticated, async (req, res) => {
  const { complaint } = req.body;
  const foundUser = await User.findOne({ hostelid: req.session.userId });

  if (!foundUser) return res.redirect("/login");

  foundUser.complaints.push({
    text: complaint,
    date: new Date(),
    status: "Pending"
  });

  await foundUser.save();

  res.redirect("/user/complaints"); // redirect instead of render (avoids duplicate form resubmission)
});

// ✅ Delete complaint
router.post("/delete-complaint/:hostelid/:complaintId", isAuthenticated, async (req, res) => {
  const { hostelid, complaintId } = req.params;

  try {
    await User.findOneAndUpdate(
      { hostelid },
      { $pull: { complaints: { _id: complaintId } } }
    );

    res.redirect("/user/complaints");
  } catch (err) {
    console.error(err);
    res.status(500).send("Server Error");
  }
});

// Show user suggestions
router.get("/suggestions", isAuthenticated, async (req, res) => {
  const foundUser = await User.findOne({ hostelid: req.session.userId });
  res.render("user/suggestions", {
    user: foundUser,
    suggestions: foundUser.suggestions,
  });
});

// Add a suggestion
router.post("/suggestions", isAuthenticated, async (req, res) => {
  const { suggestion } = req.body;
  const foundUser = await User.findOne({ hostelid: req.session.userId });
  foundUser.suggestions.push({ text: suggestion });
  await foundUser.save();

  res.redirect("/user/suggestions");
});

// ✅ Delete a suggestion (removes from DB → disappears from user & admin)
router.post("/delete-suggestion/:id", isAuthenticated, async (req, res) => {
  const foundUser = await User.findOne({ hostelid: req.session.userId });

  // Remove by MongoDB _id
  foundUser.suggestions = foundUser.suggestions.filter(
    (s) => s._id.toString() !== req.params.id
  );

  await foundUser.save();
  res.redirect("/user/suggestions");
});



// Settings (Change Password)
router.get("/settings", isAuthenticated, (req, res) => res.render("user/settings"));

router.post("/change-password", isAuthenticated, async (req, res) => {
  const { oldPassword, newPassword, confirmPassword } = req.body;
  const foundUser = await User.findOne({ hostelid: req.session.userId });

  if (!foundUser) return res.redirect("/login");
  if (newPassword !== confirmPassword) {
    return res.send("<script>alert('Passwords do not match'); window.location.href='/user/settings';</script>");
  }

  const isPasswordMatch = await bcrypt.compare(oldPassword, foundUser.password);
  if (!isPasswordMatch) {
    return res.send("<script>alert('Old password is incorrect'); window.location.href='/user/settings';</script>");
  }

  foundUser.password = await bcrypt.hash(newPassword, 10);
  await foundUser.save();

  res.send("<script>alert('Password changed successfully'); window.location.href='/user/settings';</script>");
});



// Show all notifications for users
router.get("/notifications", async (req, res) => {
  try {
    const notifications = await Notification.find().sort({ _id: -1 });

    // Mark all as seen when user opens the page
    await Notification.updateMany({ seen: false }, { $set: { seen: true } });

    res.render("user/notifications", { notifications });
  } catch (err) {
    res.status(500).send("Error loading notifications");
  }
});

module.exports = { router, notificationMiddleware };

