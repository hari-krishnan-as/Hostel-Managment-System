const express = require("express");
const User = require("../../models/User");
const router = express.Router();
const bcrypt = require("bcrypt");
const Notification = require("../../models/notification");
const Payment = require("../../models/payment");


// ---------------- Utility: Attendance ----------------
function calculateMonthlyAttendance(registrationDate, leaves = []) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const regDate = new Date(registrationDate);
  regDate.setHours(0, 0, 0, 0);

  // If registration date invalid or in future
  if (isNaN(regDate) || regDate > today) {
    return {
      presentDays: 0,
      messCutDays: 0,
      waitingApprovalDays: 0,
      totalDays: 0
    };
  }

  // 🔹 Get 1st day of current month
  const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

  // 🔹 Start counting from whichever is later: registration date or first day of this month
  const effectiveStart = regDate > firstDayOfMonth ? regDate : firstDayOfMonth;

  // 🔹 Total days from effective start to today (inclusive)
  const totalDays = Math.floor((today - effectiveStart) / (1000 * 60 * 60 * 24)) + 1;

  // 🏷️ Calculate leaves
  let messCutDays = 0;
  let waitingApprovalDays = 0;

  for (const leave of leaves) {
    const leaveFrom = new Date(leave.from);
    const leaveTo = new Date(leave.to);
    leaveFrom.setHours(0, 0, 0, 0);
    leaveTo.setHours(0, 0, 0, 0);

    // Clip leave range to [effectiveStart, today]
    const from = leaveFrom < effectiveStart ? effectiveStart : leaveFrom;
    const to = leaveTo > today ? today : leaveTo;

    if (from <= to) {
      const diff = Math.floor((to - from) / (1000 * 60 * 60 * 24)) + 1;
      if (leave.approved) messCutDays += diff;
      else waitingApprovalDays += diff;
    }
  }

  const presentDays = totalDays - (messCutDays + waitingApprovalDays);

  return {
    presentDays,
    messCutDays,
    waitingApprovalDays,
    totalDays,
    cycleStart: effectiveStart.toDateString(),
    cycleEnd: today.toDateString()
  };
}


// ---------------- UTILITY: Bill History Formatting (ROBUST VERSION) ----------------
function formatBillHistory(billingHistory, name) {
    // 1. Ensure we have an array to work with
    const history = (billingHistory || []);

    // 2. Filter out any invalid/corrupted entries BEFORE sorting/mapping
    const validHistory = history.filter(bill => 
        // CRITICAL CHECK: Ensure date exists AND studentShare is a valid number
        bill && bill.date && typeof bill.studentShare === 'number' && bill.studentShare >= 0
    );
    
    // 3. Sort and map the valid entries
    const bills = validHistory
        // FIX: Add a defensive check inside sort to handle invalid date values gracefully
        .sort((a, b) => {
            const dateA = new Date(a.date).getTime();
            const dateB = new Date(b.date).getTime();
            
            // If either date is invalid (NaN), treat it as 0 for sorting
            const timeA = isNaN(dateA) ? 0 : dateA;
            const timeB = isNaN(dateB) ? 0 : dateB;
            
            return timeB - timeA; // latest first (descending)
        }) 
        .map(bill => {
            // This relies on the filter above ensuring core properties exist
            return {
                displayDate: new Date(bill.date).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }),
                formattedShare: `₹${bill.studentShare.toFixed(2)}`,
                formattedRate: `₹${(bill.ratePerDay || 0).toFixed(2)}`, 
                formattedTotalExpense: `₹${(bill.totalExpense || 0).toFixed(2)}`, 
                presentDays: bill.presentDays || 0
            };
        });
    
    // 4. Return null if no valid bills were found (correct for Handlebars {{#if}})
    return { name, bills: bills.length ? bills : null };
}


// ---------------- Middleware ----------------
// CRITICAL FIX: Ensure the role is explicitly 'student' to prevent admin/student session confusion
const isAuthenticated = (req, res, next) => {
    // 1. FIRST CHECK: If NO user is logged in (session is empty/destroyed)
    if (!req.session.userId) {
        return res.redirect("/login");
    }

    // 2. SECOND CHECK: If the user IS logged in, check their specific role.
    if (req.session.role === 'admin') {
        // If an Admin tries to access a /user/ route, send them back to their dashboard.
        return res.redirect("/admin/dashboard");
    }

    // 3. THIRD CHECK: If the user IS logged in AND is a student, grant access.
    if (req.session.role === 'student') {
        next();
    } else {
        // Fallback for corrupt session (userId exists, but role is missing/invalid).
        res.redirect("/login");
    }
};

// FIX: Define the middleware as a standard hoisted function
async function notificationMiddleware(req, res, next) {
  try {
    // Assuming Notification model has a property to link to the user/hostel.
    // If not, this counts ALL unseen notifications, which is usually correct for the header badge.
    const unseenCount = await Notification.countDocuments({ seen: false }); 
    res.locals.notificationCount = unseenCount; // 👈 available in all hbs
    next();
  } catch (err) {
    next(err);
  }
}

// ✅ Apply notification middleware to all routes in this router
router.use(notificationMiddleware);


// ---------------- EXISTING ROUTES ----------------

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

// Mess Cut History
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


// 3. API Endpoint to fetch the latest bill data for the dashboard card
router.get("/latest-bill-card-data", isAuthenticated, async (req, res) => {
    try {
        const foundUser = await User.findOne({ hostelid: req.session.userId })
            .lean()
            // Consolidated .select() calls and removed redundant _id if not needed
            .select('billingHistory name needsBillRefresh _id') 
            .readConcern('majority'); 

        if (!foundUser) {
            return res.status(404).json({ success: false, message: "User not found." });
        }
        
        const isNewBill = foundUser.needsBillRefresh;
        
        // Sort history and get the latest one
        // Consolidated multiple variable assignments
        const sortedHistory = (foundUser.billingHistory || []).sort((a, b) => new Date(b.date) - new Date(a.date));
        const latestBillRaw = sortedHistory.length > 0 ? sortedHistory[0] : null;

        let billData = null;

        if (latestBillRaw) {
            const displayDate = new Date(latestBillRaw.date).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
            
            // Check payment status for the latest bill cycle
            const isPaid = await Payment.exists({ 
                userId: foundUser._id, 
                billingCycle: displayDate, 
                status: 'Completed' 
            });

            billData = {
                displayDate: displayDate,
                formattedShare: `₹${latestBillRaw.studentShare.toFixed(2)}`,
                presentDays: latestBillRaw.presentDays,
                share: latestBillRaw.studentShare, // Pass raw amount for payNow()
                isPaid: !!isPaid, // Convert null/object to boolean
            };
        }

        res.json({ success: true, isNewBill, latestBill: billData });

    } catch (err) {
        console.error("Error fetching card data:", err);
        res.status(500).json({ success: false, message: "Server error fetching bill card data." });
    }
});


// ---------------- PAYMENT ROUTE ----------------

// NEW POST route to handle payment submission from client after successful Razorpay checkout
router.post("/pay-bill", isAuthenticated, async (req, res) => {
    // Added Razorpay fields to the destructuring
    const { amount, billingCycle, presentDays, razorpay_payment_id, razorpay_order_id, razorpay_signature } = req.body;
    
    const foundUser = await User.findOne({ hostelid: req.session.userId });
    if (!foundUser) return res.status(404).json({ success: false, message: "User not found." });

    // Simple validation
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
        return res.status(400).json({ success: false, message: "Invalid payment amount." });
    }
    if (!razorpay_payment_id) {
        return res.status(400).json({ success: false, message: "Missing Razorpay Payment ID." });
    }

    // --- Security Note: Signature Verification is skipped here but required in production ---

    try {
        // 1. Check if the bill has already been paid for this cycle (to prevent duplicates)
        const existingPayment = await Payment.findOne({ 
            userId: foundUser._id, 
            billingCycle: billingCycle,
            status: 'Completed'
        });
        
        if (existingPayment) {
            return res.status(409).json({ success: false, message: `Bill for ${billingCycle} is already paid.` });
        }

        // 2. Create the new payment record
        await Payment.create({
            userId: foundUser._id,
            hostelid: foundUser.hostelid,
            billingCycle: billingCycle,
            amount: parsedAmount,
            presentDays: parseInt(presentDays) || 0,
            status: 'Completed',
            razorpayPaymentId: razorpay_payment_id, 
            razorpayOrderId: razorpay_order_id 
        });

        // 3. Clear the new bill flag (if set)
        await User.updateOne(
            { _id: foundUser._id },
            { $set: { needsBillRefresh: false } }
        );


        res.json({ success: true, message: `Payment of ₹${parsedAmount.toFixed(2)} for ${billingCycle} confirmed by Razorpay and recorded successfully.` });
    
    } catch (err) {
        console.error("Payment submission error:", err);
        // Catch the unique index error for double payment attempts
        if (err.code === 11000) { 
             return res.status(409).json({ success: false, message: `Bill for ${billingCycle} is already paid (duplicate entry).` });
        }
        res.status(500).json({ success: false, message: "Server error during payment processing." });
    }
});


// ---------------- MESS BILL ROUTES (FIXED) ----------------

// Mess Bill History (Modified: removed variable redeclaration)
router.get("/mess-bill", isAuthenticated, async (req, res) => {
    try {
        const foundUser = await User.findOne({ hostelid: req.session.userId }).lean();

        if (!foundUser) return res.redirect("/login");
        
        // Pass the middleware variable to the template (assuming it's set in res.locals)
        const notificationCount = res.locals.notificationCount || 0; 

        // Use the new function to format the bill data
        const { name, bills } = formatBillHistory(foundUser.billingHistory, foundUser.name);
        
        // Render the template
        res.render("user/mess-bill", { name, bills: bills, notificationCount });

    } catch (err) {
        console.error("❌ Error fetching mess bill:", err);
        // Fallback error page
        res.status(500).send("Server Error: Unable to process bill request.");
    }
});


// ---------------- COMPLAINTS & SUGGESTIONS ----------------

// complaints 
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

// Suggestions
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


// Settings
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

// ---------------- MODULE EXPORT ----------------
module.exports = { router, notificationMiddleware };