const express = require("express");
const User = require("../../models/User");
const router = express.Router();
const bcrypt = require("bcrypt");
const Notification = require("../../models/notification");

// ---------------- Utility: Attendance (FIXED: Moved to top) ----------------
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
// ---------------- END Utility: Attendance ----------------


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


// New utility function to format and process bill data
function formatBillHistory(billingHistory, name) {
    const bills = (billingHistory || [])
        .sort((a, b) => new Date(b.date) - new Date(a.date)) // latest first
        .map(bill => ({
            displayDate: new Date(bill.date).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }),
            formattedShare: `₹${bill.studentShare.toFixed(2)}`,
            formattedRate: `₹${bill.ratePerDay.toFixed(2)}`,
            formattedTotalExpense: `₹${bill.totalExpense.toFixed(2)}`,
            presentDays: bill.presentDays
        }));
    
    return { name, bills: bills.length ? bills : null };
}


// ---------------- EXISTING ROUTES (ADJUSTED) ----------------

// Dashboard (UNCHANGED)
router.get("/dashboard", isAuthenticated, async (req, res) => {
  const foundUser = await User.findOne({ hostelid: req.session.userId });
  if (foundUser) res.render("user/student_dashboard", { user: foundUser });
  else res.redirect("/login");
});

// Profile (UNCHANGED)
router.get("/profile", isAuthenticated, async (req, res) => {
  const foundUser = await User.findOne({ hostelid: req.session.userId });
  if (!foundUser) return res.redirect("/login");

    const displayDate = foundUser.registrationDate.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: '2-digit',
        timeZone: 'UTC' 
    });
    
    const userForProfile = {
        ...foundUser._doc,
        registrationDate: displayDate 
    };


  res.render("user/profile", { user: userForProfile });
});

// Attendance (FIXED: Now can call the function)
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

// Apply Mess Cut (FIXED: Now can call the function)
router.post("/apply-mess-cut", isAuthenticated, async (req, res) => {
  const { startDate, endDate } = req.body;
  const foundUser = await User.findOne({ hostelid: req.session.userId });
  
  if (!foundUser) return res.redirect("/login");


// --- START: Date Validation and Adjustment ---
  const now = new Date();
  const today = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  

  const tomorrow = new Date(today);
  tomorrow.setUTCDate(today.getUTCDate() + 1);


  const requestedStart = new Date(startDate);
  const requestedEnd = new Date(endDate);
    
  const requestedStartUTC = new Date(Date.UTC(requestedStart.getFullYear(), requestedStart.getMonth(), requestedStart.getDate()));
    
  if (requestedEnd < requestedStartUTC) {
        return res.send("<script>alert('End date cannot be before the start date.'); window.location.href='/user/mess-cut';</script>");
  }


  let adjustedStart = requestedStartUTC;
  let message = "Leave application submitted successfully, pending admin approval.";


  if (requestedStartUTC < tomorrow) {
        
    adjustedStart = tomorrow;
    
if (requestedEnd < adjustedStart) {
        return res.send("<script>alert('The minimum notice period is 1 day. Please adjust your dates.'); window.location.href='/user/mess-cut';</script>");
    }

    const year = adjustedStart.getUTCFullYear();
    const month = String(adjustedStart.getUTCMonth() + 1).padStart(2, '0');
    const day = String(adjustedStart.getUTCDate()).padStart(2, '0');
    const adjustedDateString = `${year}-${month}-${day}`;

    message = `Notice period is 1 day. Your leave start date has been automatically adjusted to tomorrow (${adjustedDateString}). It is now pending approval.`;
  }

  // Process the leave request with the potentially adjusted start date
  foundUser.leaves.push({
    from: adjustedStart, 
    to: requestedEnd,
    approved: false,
  });
  await foundUser.save();


  res.send(`<script>alert('${message}'); window.location.href='/user/mess-cut';</script>`);
});

// Mess Cut History (UNCHANGED)
router.get("/mess-cut", isAuthenticated, async (req, res) => {
  const foundUser = await User.findOne({ hostelid: req.session.userId });
  if (!foundUser) return res.redirect("/login");

  res.render("user/mess-cut", { user: foundUser, messCuts: foundUser.leaves });
});


// ---------------- NEW API ENDPOINTS ----------------

// 1. API Endpoint to check if the bill flag is set (for dashboard AJAX check)
router.get("/bill-status", isAuthenticated, async (req, res) => {
    try {
        const user = await User.findOne({ hostelid: req.session.userId })
            .lean()
            .select('needsBillRefresh')
            .readConcern('majority');

        res.json({ billGenerated: user && user.needsBillRefresh });
    } catch (err) {
        // Must send a valid JSON response even on error so the frontend doesn't crash
        res.status(500).json({ billGenerated: false, error: err.message });
    }
});


// 2. API Endpoint to fetch the latest bill data and CLEAR the flag
router.get("/fetch-latest-bill-data", isAuthenticated, async (req, res) => {
    try {
        // Atomic operation: find the user, reset the flag, and return the new user document
        const foundUser = await User.findOneAndUpdate(
            { hostelid: req.session.userId },
            { $set: { needsBillRefresh: false } },
            // Use 'new: true' to get the fresh document, 'lean: true' for speed, 
            // and 'readConcern: majority' for data freshness guarantee.
            { new: true, lean: true, select: '-password', readConcern: 'majority' } 
        );

        if (!foundUser) {
            return res.status(404).json({ success: false, message: "User not found." });
        }
        
        const billData = formatBillHistory(foundUser.billingHistory, foundUser.name);
        
        res.json({ success: true, billData });

    } catch (err) {
        console.error("Error fetching latest bill:", err);
        res.status(500).json({ success: false, message: "Server error fetching bill." });
    }
});




// complaints (UNCHANGED)
router.get("/complaints", isAuthenticated, async (req, res) => {
  const foundUser = await User.findOne({ hostelid: req.session.userId });
  if (!foundUser) return res.redirect("/login");

  res.render("user/complaints", { 
    user: foundUser, 
    complaints: foundUser.complaints
  });
});


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

  res.redirect("/user/complaints");
});


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

// Suggestions (UNCHANGED)
router.get("/suggestions", isAuthenticated, async (req, res) => {
  const foundUser = await User.findOne({ hostelid: req.session.userId });
  res.render("user/suggestions", {
    user: foundUser,
    suggestions: foundUser.suggestions,
  });
});


router.post("/suggestions", isAuthenticated, async (req, res) => {
  const { suggestion } = req.body;
  const foundUser = await User.findOne({ hostelid: req.session.userId });
  foundUser.suggestions.push({ text: suggestion });
  await foundUser.save();

  res.redirect("/user/suggestions");
});


router.post("/delete-suggestion/:id", isAuthenticated, async (req, res) => {
  const foundUser = await User.findOne({ hostelid: req.session.userId });

    foundUser.suggestions = foundUser.suggestions.filter(
    (s) => s._id.toString() !== req.params.id
  );

  await foundUser.save();
  res.redirect("/user/suggestions");
});


// Settings (UNCHANGED)
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


// Mess Bill History (Modified to use the new formatter)
router.get("/mess-bill", isAuthenticated, async (req, res) => {
  try {
    const foundUser = await User.findOne({ hostelid: req.session.userId }).lean();

    if (!foundUser) return res.redirect("/login");

    // Use the new function to format the bill data
    const { name, bills } = formatBillHistory(foundUser.billingHistory, foundUser.name);

    res.render("user/mess-bill", { name, bills: bills });

  } catch (err) {
    console.error("Error fetching mess bill:", err);
    res.status(500).send("Server Error");
  }
});

//full history
router.get("/mess-bill1", isAuthenticated, async (req, res) => {
    try {
        const foundUser = await User.findOne({ hostelid: req.session.userId }).lean();
    
        if (!foundUser) return res.redirect("/login");
    
        // Use the new function to format the bill data
        const { name, bills } = formatBillHistory(foundUser.billingHistory, foundUser.name);
    
        // Render the new template
        res.render("user/mess-bill1", { name, bills: bills });
    
    } catch (err) {
        console.error("Error fetching full mess bill history:", err);
        res.status(500).send("Server Error");
    }
});

router.get("/latest-bill-card-data", isAuthenticated, async (req, res) => {
    try {
        const foundUser = await User.findOne({ hostelid: req.session.userId })
            .lean()
            .select('billingHistory name needsBillRefresh') 
            .readConcern('majority'); 

        if (!foundUser) {
            return res.status(404).json({ success: false, message: "User not found." });
        }
        
        const isNewBill = foundUser.needsBillRefresh;
        
        // Sort history and get the latest one
        const latestBill = foundUser.billingHistory.length > 0
            ? foundUser.billingHistory.sort((a, b) => new Date(b.date) - new Date(a.date))[0]
            : null;

        let billData = null;
        if (latestBill) {
             billData = {
                displayDate: new Date(latestBill.date).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }),
                formattedShare: `₹${latestBill.studentShare.toFixed(2)}`,
                presentDays: latestBill.presentDays
            };
        }

        res.json({ success: true, isNewBill, latestBill: billData });

    } catch (err) {
        console.error("Error fetching card data:", err);
        res.status(500).json({ success: false, message: "Server error fetching bill card data." });
    }
});

router.get("/bill-status", isAuthenticated, async (req, res) => {
    try {
        const user = await User.findOne({ hostelid: req.session.userId })
            .lean()
            .select('needsBillRefresh')
            .readConcern('majority');

        res.json({ billGenerated: user && user.needsBillRefresh });
    } catch (err) {
        // Must send a valid JSON response even on error so the frontend doesn't crash
        res.status(500).json({ billGenerated: false, error: err.message });
    }
});


module.exports = { router, notificationMiddleware };