// adminRoutes.js

const express = require("express");
const router = express.Router();
const User = require("../../models/User");
const Notification = require("../../models/notification");
const multer = require("multer"); // 1. Import multer
const XLSX = require("xlsx"); // 1. Import XLSX

// 2. Configure multer for file storage in memory (buffer)
const upload = multer({ storage: multer.memoryStorage() }); 

// Middleware: check login
const isAuthenticated = (req, res, next) => {
  if (req.session.userId) next();
  else res.redirect("/login");
};

// --- START: NEW EXCEL UPLOAD ROUTES ---

// 3. GET: Display upload form 
router.get("/upload-sheet", isAuthenticated, async (req, res) => {
  const admin = await User.findOne({ hostelid: req.session.userId });
  if (admin && admin.role === "admin") {
    // NOTE: You need a view file at views/admin/upload-sheet.hbs 
    // that contains a form like: <form enctype="multipart/form-data" method="POST" action="/admin/upload-sheet"> ...
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


// Admin Dashboard
router.get("/dashboard", isAuthenticated, async (req, res) => {
  const admin = await User.findOne({ hostelid: req.session.userId });
  if (admin && admin.role === "admin") {
    res.render("admin/admin_dashboard", { name: admin.name });
  } else {
    res.redirect("/login");
  }
});



// Registered Users List (formerly Pending Users)
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
