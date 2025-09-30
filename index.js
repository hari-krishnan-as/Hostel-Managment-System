// index.js

const express = require("express");
const path = require("path");
const session = require("express-session");
const hbs = require("hbs");
const bcrypt = require("bcrypt");
const XLSX = require("xlsx");
require("dotenv").config();

// Import DB connection and models
const connectDB = require("./config");
const User = require("./models/User.js");

// Import routes
const adminRoutes = require("./src/admin/adminRoutes");
const { router: userRoutes, notificationMiddleware } = require("./src/user/userRoutes");

const app = express();

connectDB();

// --- START: Excel Data Loading (FINAL FIX FOR DATES) ---
let registrationData = [];

// Explicit Windows path provided by the user (C:\Users\alias\OneDrive\Desktop\registration_sheet.xlsx)
const EXCEL_FILE_PATH = "C:\\Users\\alias\\OneDrive\\Desktop\\registration_sheet.xlsx";

try {
  // CRITICAL FIX: Use the cellDates option to correctly parse dates stored in Excel
  const workbook = XLSX.readFile(EXCEL_FILE_PATH, { cellDates: true }); 
  const sheetName = workbook.SheetNames[0]; 
  let rawData = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);
  
  // Aggressively clean and normalize the data
  registrationData = rawData.map(record => {
    const cleanedRecord = {};
    for (const key in record) {
      if (typeof record[key] === 'string') {
        // Trim whitespace from all string fields
        cleanedRecord[key] = record[key].trim();
      } else if (record[key] instanceof Date) {
        // Keep Date objects as they are (parsed correctly by {cellDates: true})
        cleanedRecord[key] = record[key];
      } else {
        // Keep other non-string data (like Semester/Numbers) as is
        cleanedRecord[key] = record[key];
      }
    }
    return cleanedRecord;
  });

} catch (error) {
  console.error("❌ Error loading Excel sheet (CRITICAL):", error.message);
  console.error("Please fix the file path or permissions before running.");
  process.exit(1); // STOP THE SERVER IF EXCEL FAILS TO LOAD
}

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Session setup
app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false },
  })
);

// Views setup
app.set("view engine", "hbs");
app.set("views", path.join(__dirname, "views"));
app.use(express.static(path.join(__dirname, "public")));

// Handlebars helpers
hbs.registerHelper("calcDays", (from, to) => {
  const start = new Date(from);
  const end = new Date(to);
  if (isNaN(start) || isNaN(end)) return "N/A";
  return Math.floor((end - start) / (1000 * 60 * 60 * 24)) + 1;
});

hbs.registerHelper("eq", function (a, b) {
  return a === b;
});

// Default public routes
app.get("/", (req, res) => res.render("home"));
app.get("/login", (req, res) => res.render("login"));
app.get("/request", (req, res) => res.render("request"));
app.get("/about", (req, res) => res.render("about"));
app.get("/contact", (req, res) => res.render("contact"));

// Redirect to correct attendance page
app.get("/attendance", (req, res) => res.redirect("/user/attendance"));

// Register user
app.post("/request", async (req, res) => {
  let data = {};
  
  try {
    const { name, department, program, password, role } = req.body;

    // 1. DIAGNOSTIC FIND: Try to find user by NAME ONLY
    const excelUser = registrationData.find(
      (record) => String(record.Name || '').toLowerCase() === name.toLowerCase()
    );

    if (!excelUser) {
      return res.send("<script>alert('Your Name does not match any pending registration record.'); window.location.href='/request';</script>");
    }
    
    // --- DIAGNOSTIC CHECK: User found by name, now check department/program ---
    const excelDept = String(excelUser.Department || '').toLowerCase();
    const excelProgramStr = String(excelUser.Program || '').toLowerCase();
    
    if (excelDept !== department.toLowerCase() || excelProgramStr !== program.toLowerCase()) {
        return res.send("<script>alert('Details found, but Department or Program mismatch. Please verify inputs.'); window.location.href='/request';</script>");
    }

    // --- START: HosteliD Pre-checks and Generation ---
    const excelRegDateValue = excelUser.RegistrationDate;

    if (!excelProgramStr || !excelRegDateValue) {
        return res.send("<script>alert('Internal registration data is incomplete. Missing Program or Registration Date in Excel.'); window.location.href='/request';</script>");
    }

    const rawDate = (excelRegDateValue instanceof Date) ? excelRegDateValue : new Date(excelRegDateValue);
    
    if (isNaN(rawDate.getTime())) {
        return res.send("<script>alert('Internal registration date format is invalid.'); window.location.href='/request';</script>");
    }
    
    // ✅ FIX: Use Date.UTC() to construct the date object. This prevents the local 
    // timezone offset from shifting the calendar day when saving to MongoDB.
    const regDate = new Date(Date.UTC(rawDate.getFullYear(), rawDate.getMonth(), rawDate.getDate()));
    
    // Use getUTCFullYear() to retrieve the correct year for the Hostel ID prefix
    const currentYearLastTwo = regDate.getUTCFullYear().toString().slice(-2);
    const nameSlug = String(excelUser.Name || name).toLowerCase().replace(/[^a-z0-9]/g, '');
    
    // ✅ FINAL HOSTEL ID FORMAT: SNG + Year + Program + FullNameSlug (e.g., SNG25MCAshon)
    const generatedHostelid = `SNG${currentYearLastTwo}${excelProgramStr.toUpperCase()}${nameSlug}`; 

    // --- START: SAFE SEMESTER ASSIGNMENT ---
    let semesterValue = excelUser.Semester || req.body.semester;
    if (typeof semesterValue !== 'number' || isNaN(semesterValue)) {
        semesterValue = 1; 
    }

    // 3. Prepare the final data object
    data = { 
      name: excelUser.Name,
      department: excelUser.Department,
      program: excelUser.Program, 
      semester: semesterValue, 
      
      hostelid: generatedHostelid, 
      password: await bcrypt.hash(password, 10),
      role: role || "student",
      registrationDate: regDate, // Use the UTC-fixed date object
    };

    // 4. Check if user with generated hostelid already exists in DB
    const existingUser = await User.findOne({ hostelid: data.hostelid });
    if (existingUser) {
      return res.send(`<script>alert('Account with Hostel ID ${data.hostelid} already exists. Please log in.'); window.location.href='/login';</script>`);
    }

    // 5. Create the user
    await User.create(data);
    
    res.send(`<script>alert('Registration successful! Your Hostel ID is: ${data.hostelid}. Please log in.'); window.location.href='/login';</script>`);

  } catch (err) {
    // All error console.logs removed
    res.status(500).send("Internal Server Error");
  }
});

// Login user
app.post("/login", async (req, res) => {
  try {
    const user = await User.findOne({ hostelid: req.body.hostelid });
    if (!user) {
      return res.send("<script>alert('User not found'); window.location.href='/login';</script>");
    }

    const isMatch = await bcrypt.compare(req.body.password, user.password);
    if (!isMatch) {
      return res.send("<script>alert('Wrong Password'); window.location.href='/login';</script>");
    }

   req.session.userId = user.hostelid;
   if (user.role === "admin") return res.redirect("/admin/dashboard");
    else return res.redirect("/user/dashboard");
  } catch (err) {
    // console.error("Login error:", err.message); // removed
    res.status(500).send("Internal Server Error");
  }
});

// Logout
app.get("/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/"));
});

// Mount routes
app.use("/admin", adminRoutes);
app.use("/user", userRoutes); // ✅ pass only the router

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
