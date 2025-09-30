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



// userRoutes.js

// ---------------- Utility: Attendance ----------------
function calculateMonthlyAttendance(registrationDate, leaves = []) {
  const today = new Date();
  today.setHours(0, 0, 0, 0); // Normalize today to the start of the day
  
  const regDate = new Date(registrationDate);
  regDate.setHours(0, 0, 0, 0); // Normalize registration date

  // Safety check: If registration is in the future, return 0 attendance.
  if (regDate > today) {
    return {
      cycleStart: today.toDateString(),
      cycleEnd: today.toDateString(),
      presentDays: 0,
      messCutDays: 0,
      waitingApprovalDays: 0,
      totalDays: 0
    };
  }

  // Define current date components
  const currentMonth = today.getMonth();
  const currentYear = today.getFullYear();

  // 1. Determine the Cycle Start Date (Start of the attendance period)
  let cycleStart = new Date(currentYear, currentMonth, 1);
  cycleStart.setHours(0, 0, 0, 0);

  // Rule: If registration happened in the *current* month, attendance starts on the Reg Date.
  // Otherwise, it starts on the 1st of the current calendar month.
  if (regDate.getFullYear() === currentYear && regDate.getMonth() === currentMonth) {
    cycleStart = regDate;
  }

  // Attendance is always calculated up to the end of today.
  const cycleEnd = today;

  // 3. Calculate Total Days in the Cycle (inclusive)
  const totalDays = Math.floor((cycleEnd.getTime() - cycleStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;

  let messCutDays = 0;
  let waitingApprovalDays = 0;

  // 4. Count leave days that overlap with the current cycle [cycleStart, cycleEnd]
  leaves.forEach((leave) => {
    const leaveFrom = new Date(leave.from);
    leaveFrom.setHours(0, 0, 0, 0);
    const leaveTo = new Date(leave.to);
    leaveTo.setHours(0, 0, 0, 0);

    // Clip leave interval: the leave can only count if it falls between cycleStart and cycleEnd
    const from = leaveFrom < cycleStart ? cycleStart : leaveFrom;
    const to = leaveTo > cycleEnd ? cycleEnd : leaveTo;

    // Check if there is any overlap
    if (from <= to) {
      // Calculate difference in days (inclusive)
      const diff = Math.floor((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24)) + 1;

      if (leave.approved) messCutDays += diff; 
      else waitingApprovalDays += diff; 
    }
  });

  // 5. Calculate Present Days
  // Present Days = Total Expected Days - (Approved Leaves + Pending Leaves)
  const presentDays = totalDays - (messCutDays + waitingApprovalDays);

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

    // ✅ SIMPLE FIX: Format the Date object to a simple string for display
    const displayDate = foundUser.registrationDate.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: '2-digit',
        // Crucial: Forces the date to be read using UTC, ensuring the stored calendar day is preserved
        timeZone: 'UTC' 
    });
    
    // Create a new object that includes all user data but replaces the complex Date object
    const userForProfile = {
        ...foundUser._doc, // Spreads all original Mongoose document properties
        registrationDate: displayDate // Overwrites with the formatted string
    };


  res.render("user/profile", { user: userForProfile });
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

