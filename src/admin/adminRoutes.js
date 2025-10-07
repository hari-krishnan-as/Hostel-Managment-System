const mongoose = require("mongoose");
const express = require("express");
const router = express.Router();
const User = require("../../models/User");
const Notification = require("../../models/notification");
const Expense = require("../../models/expense");
const multer = require("multer"); 
const XLSX = require("xlsx"); 

// 2. Configure multer for file storage in memory (buffer)
const upload = multer({ storage: multer.memoryStorage() }); 

// Middleware: check login
const isAuthenticated = (req, res, next) => {
  if (req.session.userId) next();
  else res.redirect("/login");
};

// --- START: NEW EXCEL UPLOAD ROUTES (UNCHANGED) ---

// 3. GET: Display upload form 
router.get("/upload-sheet", isAuthenticated, async (req, res) => {
  const admin = await User.findOne({ hostelid: req.session.userId });
  if (admin && admin.role === "admin") {
    res.render("admin/upload-sheet", { name: admin.name });
  } else {
    res.redirect("/login");
  }
});

// 4. POST: Handle file upload, parsing, and data storage
router.post("/upload-sheet", isAuthenticated, upload.single("registrationFile"), async (req, res) => {
  // Security check
  const admin = await User.findOne({ hostelid: req.session.userId });
  if (!admin || admin.role !== "admin") return res.redirect("/login");

  if (!req.file) {
    return res.send("<script>alert('No file uploaded.'); window.location.href='/admin/upload-sheet';</script>");
  }
    
  try {
    // Read the file buffer from multer
    const workbook = XLSX.read(req.file.buffer, { type: 'buffer', cellDates: true });
    const sheetName = workbook.SheetNames[0]; 
    let rawData = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);

    // Aggressively clean and normalize the data (same logic as in the old index.js)
    const cleanedData = rawData.map(record => {
        const cleanedRecord = {};
        for (const key in record) {
            if (typeof record[key] === 'string') {
                cleanedRecord[key] = record[key].trim();
            } else if (record[key] instanceof Date) {
                cleanedRecord[key] = cleanedRecord[key] = new Date(Date.UTC(record[key].getFullYear(), record[key].getMonth(), record[key].getDate()));
            } else {
                cleanedRecord[key] = record[key];
            }
        }
        return cleanedRecord;
    });
    
    // Store the parsed data in app.locals for the main application to use
    req.app.locals.registrationData = cleanedData;
    console.log(`✅ Excel sheet successfully loaded and parsed. Total records: ${cleanedData.length}`);

    return res.send("<script>alert('Registration sheet uploaded and data updated successfully. Total records loaded: " + cleanedData.length + "'); window.location.href='/admin/dashboard';</script>");

  } catch (error) {
    console.error("❌ Error processing uploaded Excel sheet:", error.message);
    return res.send("<script>alert('Error processing file. Please ensure it is a valid Excel file and the format is correct.'); window.location.href='/admin/upload-sheet';</script>");
  }
});

// --- END: NEW EXCEL UPLOAD ROUTES ---


// Admin Dashboard (UNCHANGED)
router.get("/dashboard", isAuthenticated, async (req, res) => {
  const admin = await User.findOne({ hostelid: req.session.userId });
  if (admin && admin.role === "admin") {
    res.render("admin/admin_dashboard", { name: admin.name });
  } else {
    res.redirect("/login");
  }
});



// Registered Users List (UNCHANGED)
router.get("/pending-users", isAuthenticated, async (req, res) => {
  const admin = await User.findOne({ hostelid: req.session.userId });
  
  if (!admin || admin.role !== "admin") return res.redirect("/login");

  // 1. Fetch all registered students (excluding admin)
  const registeredUsers = await User.find({ role: { $ne: 'admin' } }).select('-password');

    // 2. ✅ FIX: Get unique program names by converting them all to uppercase first.
    const uniqueProgramsSet = new Set(
        registeredUsers.map(user => String(user.program).toUpperCase())
    );
    
    // Convert the Set back to an array for the template
    const uniquePrograms = [...uniqueProgramsSet].filter(p => p);
    
  res.render("admin/pending-users", { 
    registeredUsers: registeredUsers,
    uniquePrograms: uniquePrograms // Only contains uppercase/standardized program names
});
});

// Approve user (UNCHANGED)
router.post("/approve/:id", isAuthenticated, async (req, res) => {
  await User.findByIdAndUpdate(req.params.id, { isApproved: true });
  res.redirect("/admin/pending-users");
});


// Approve Mess Cut (UNCHANGED)
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

// Approve a specific mess cut request (UNCHANGED)
router.post("/approve-messcut/:id", isAuthenticated, async (req, res) => {
  await User.updateOne(
    { "leaves._id": req.params.id },
    { $set: { "leaves.$.approved": true } }
  );
  res.redirect("/admin/approve-messcut");
});

// View complaints (UNCHANGED)
router.get("/view-complaint", isAuthenticated, async (req, res) => {
    // Check if the user is an admin (optional, but good practice)
    const admin = await User.findOne({ hostelid: req.session.userId });
    if (!admin || admin.role !== "admin") return res.redirect("/login");
    const users = await User.find(
        { "complaints.0": { $exists: true } }, 
        { name: 1, hostelid: 1, program: 1, complaints: 1 } // Added 'program' field
    ).lean(); 
    const uniqueProgramsSet = new Set(
        users.map(user => String(user.program).toUpperCase())
    );
    const uniquePrograms = [...uniqueProgramsSet].filter(p => p);
    res.render("admin/view-complaint", { 
        users: users,
        uniquePrograms: uniquePrograms // Pass the unique list to the template
    });
});

router.post("/update-complaint/:userId/:complaintId", isAuthenticated, async (req, res) => {
  const { userId, complaintId } = req.params;
  const { status } = req.body;

  await User.findOneAndUpdate(
    { _id: userId, "complaints._id": complaintId },
    { $set: { "complaints.$.status": status } }
  );
  res.redirect("/admin/view-complaint");
});

// View suggestions (UNCHANGED)
router.get("/view-suggestion", isAuthenticated, async (req, res) => {
  const users = await User.find({ "suggestions.0": { $exists: true } }, "name hostelid suggestions");
  res.render("admin/view-suggestion", { users });
});

// Give notification page (UNCHANGED)
router.get("/give-notification", isAuthenticated, async (req, res) => {
  const notifications = await Notification.find().sort({ _id: -1 });
  res.render("admin/give-notification", { notifications });
});

// POST notification (UNCHANGED)
router.post("/give-notification", isAuthenticated, async (req, res) => {
  const { message } = req.body;
  await Notification.create({ message });
  res.redirect("/admin/give-notification");
});

// Delete notification (UNCHANGED)
router.post("/delete-notification/:id", isAuthenticated, async (req, res) => {
  await Notification.findByIdAndDelete(req.params.id);
  res.redirect("/admin/give-notification");
});

// --- UTILITY: ATTENDANCE CALCULATION FOR BILLING (UNCHANGED) ---
function calculateMonthlyAttendance(registrationDate, leaves = []) {
    const today = new Date();
    today.setHours(0, 0, 0, 0); 
    
    const regDate = new Date(registrationDate);
    regDate.setHours(0, 0, 0, 0); 

    // Define current date components
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();

    // 1. Determine the Cycle Start Date (Start of the attendance period)
    let cycleStart = new Date(currentYear, currentMonth, 1);
    cycleStart.setHours(0, 0, 0, 0);

    // Rule: If registration happened in the *current* month, attendance starts on the Reg Date.
    if (regDate.getFullYear() === currentYear && regDate.getMonth() === currentMonth) {
        cycleStart = regDate;
    }

    // Attendance is always calculated up to the end of today.
    const cycleEnd = today;

    // 3. Calculate Total Days in the Cycle (inclusive)
    const totalDays = Math.floor((cycleEnd.getTime() - cycleStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;

    let messCutDays = 0;

    // 4. Count *Approved* leave days that overlap with the current cycle [cycleStart, cycleEnd]
    leaves.forEach((leave) => {
        // Only count approved leaves for mess cut/billing
        if (!leave.approved) return; 

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
            messCutDays += diff; 
        }
    });

    // 5. Calculate Present Days
    const presentDays = totalDays - messCutDays;

    return {
        presentDays: Math.max(0, presentDays), // ensure it's not negative
        totalDays,
    };
}

// -------------------- Generate Bill --------------------
router.post("/generate-bill", isAuthenticated, async (req, res) => {
    try {
        // Check admin
        const admin = await User.findOne({ hostelid: req.session.userId });
        if (!admin || admin.role !== "admin") {
            return res.status(403).json({ success: false, message: "Unauthorized" });
        }

        // Extract expenses
        const { kitchenRent, kitchenExpense, staffSalary, totalExpense } = req.body;
        const totalMessExpense = parseFloat(totalExpense);

        if (isNaN(totalMessExpense) || totalMessExpense <= 0) {
            return res.status(400).json({ success: false, message: "Invalid total expense amount." });
        }

        const now = new Date();
        const monthYear = `${String(now.getMonth() + 1).padStart(2, '0')}-${now.getFullYear()}`;

        // Check if bill for this month already exists
        const existingBill = await Expense.findOne({ monthYear });
        if (existingBill) {
            return res.status(409).json({
                success: false,
                message: `Bill for ${monthYear} already exists. Delete old one to generate new.`
            });
        }

        // Fetch all students
        const allStudents = await User.find({ role: { $ne: 'admin' } });

        let totalPresentDaysAcrossAllUsers = 0;
        const studentAttendance = [];

        // Calculate attendance
        for (const student of allStudents) {
            const { presentDays } = calculateMonthlyAttendance(student.registrationDate, student.leaves || []);
            totalPresentDaysAcrossAllUsers += presentDays;
            studentAttendance.push({ studentId: student._id, presentDays });
        }

        if (totalPresentDaysAcrossAllUsers === 0) {
            return res.status(200).json({
                success: true,
                message: "No attendance found this month. Bill not generated.",
                usersUpdated: 0,
                ratePerPresentDay: 0
            });
        }

        const ratePerPresentDay = totalMessExpense / totalPresentDaysAcrossAllUsers;

        // Save expense record
        const newExpense = new Expense({
            date: now,
            monthYear,
            kitchenRent: parseFloat(kitchenRent),
            kitchenExpense: parseFloat(kitchenExpense),
            staffSalary: parseFloat(staffSalary),
            totalExpense: totalMessExpense,
            ratePerDay: ratePerPresentDay,
            usersBilledCount: studentAttendance.length
        });

        await newExpense.save();

        // ---------------------- FIX: Bulk Update & Set Signal Flag ----------------------
        
        let usersUpdatedCount = 0;
        const billedStudents = studentAttendance.filter(rec => rec.presentDays > 0);

        const bulkOperations = billedStudents.map(record => {
            const studentBill = Math.round(record.presentDays * ratePerPresentDay);
            
            return {
                updateOne: {
                    filter: { _id: record.studentId },
                    update: {
                        $push: { 
                            billingHistory: {
                                date: now,
                                totalExpense: totalMessExpense,
                                studentShare: studentBill,
                                presentDays: record.presentDays,
                                ratePerDay: ratePerPresentDay
                            }
                        },
                        // ✅ Set the signal flag to true for all billed students
                        $set: { needsBillRefresh: true } 
                    }
                }
            };
        });

        if (bulkOperations.length > 0) {
            const result = await User.bulkWrite(bulkOperations);
            usersUpdatedCount = result.modifiedCount;
        } else {
            usersUpdatedCount = 0; 
        }

        // -----------------------------------------------------------------------------

        return res.json({
            success: true,
            message: "Bill generated successfully.",
            usersUpdated: usersUpdatedCount,
            ratePerPresentDay: ratePerPresentDay.toFixed(2)
        });

    } catch (err) {
        console.error("Error generating bill:", err);
        return res.status(500).json({ success: false, message: "Server error generating bill." });
    }
});


// -------------------- Expense Log (UNCHANGED) --------------------
router.get("/expense-log", isAuthenticated, async (req, res) => {
    const ExpenseModel = mongoose.model("Expense");

    try {
        const latestBill = await ExpenseModel.findOne().sort({ date: -1 }).lean();

        if (latestBill && latestBill.date) {
            latestBill.formattedDate = latestBill.date.toLocaleDateString("en-US", {
                year: "numeric",
                month: "short",
                day: "2-digit",
                timeZone: "UTC"
            });

            latestBill.ratePerDay = latestBill.ratePerDay
                ? latestBill.ratePerDay.toFixed(2)
                : "0.00";
            latestBill.totalExpense = latestBill.totalExpense
                ? latestBill.totalExpense.toFixed(2)
                : "0.00";
        }

        res.render("admin/expense-log", { latestBill });
    } catch {
        res.render("admin/expense-log", { latestBill: null, error: "Database error loading history." });
    }
});


module.exports = router;
