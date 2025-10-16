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

// --- MODIFIED: Excel Data Storage (Now loaded via Admin upload) ---
// Initialize registrationData globally. It will be populated after an admin successfully uploads a file.
let registrationData = []; 

// Store the registration data in app.locals so it can be accessed easily by other parts of the application.
// This is where the admin upload route will store the parsed data.
app.locals.registrationData = registrationData; 


// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Session setup
app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false, // CRITICAL FIX: Only create session when user logs in
    cookie: { 
      secure: false, // Keep false for localhost (HTTP)
      httpOnly: true, // Recommended for security
      maxAge: 1000 * 60 * 60 * 24 * 7 // Set cookie lifespan: 7 days
    },
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
    // Get the current registration data from app.locals
    const currentRegistrationData = app.locals.registrationData || []; 

    if (currentRegistrationData.length === 0) {
      return res.send("<script>alert('Student not found in registration sheet uploaded by the admin. Please try again later.'); window.location.href='/request';</script>");
    }

    // Removed 'semester' from destructuring
    const { name, department, program, password, role } = req.body;

    // 1. Try to find user by NAME ONLY
    const excelUser = currentRegistrationData.find(
      (record) => String(record.Name || '').toLowerCase() === name.toLowerCase()
    );

    if (!excelUser) {
      return res.send("<script>alert('Your Name does not match any pending registration record.'); window.location.href='/request';</script>");
    }
    
    // Check department/program
    const excelDept = String(excelUser.Department || '').toLowerCase();
    const excelProgramStr = String(excelUser.Program || '').toLowerCase();
    
    if (excelDept !== department.toLowerCase() || excelProgramStr !== program.toLowerCase()) {
        return res.send("<script>alert('Details found, but Department or Program mismatch. Please verify inputs.'); window.location.href='/request';</script>");
    }

    // --- START: HosteliD Pre-checks and Generation ---
    const excelRegDateValue = excelUser.RegistrationDate;

    if (!excelProgramStr || !excelRegDateValue || (excelRegDateValue instanceof Date && isNaN(excelRegDateValue.getTime()))) {
        return res.send("<script>alert('Internal registration data is incomplete. Missing Program or Registration Date in Excel, or date is invalid.'); window.location.href='/request';</script>");
    }

    const rawDate = (excelRegDateValue instanceof Date) ? excelRegDateValue : new Date(excelRegDateValue);
    
    if (isNaN(rawDate.getTime())) {
        return res.send("<script>alert('Internal registration date format is invalid.'); window.location.href='/request';</script>");
    }
    
    // FIX: Use Date.UTC() to construct the date object.
    const regDate = new Date(Date.UTC(rawDate.getFullYear(), rawDate.getMonth(), rawDate.getDate()));
    
    // Use getUTCFullYear() to retrieve the correct year for the Hostel ID prefix
    const currentYearLastTwo = regDate.getUTCFullYear().toString().slice(-2);
    const nameSlug = String(excelUser.Name || name).toLowerCase().replace(/[^a-z0-9]/g, '');
    
    // FINAL HOSTEL ID FORMAT: SNG + Year + Program + FullNameSlug
    const generatedHostelid = `SNG${currentYearLastTwo}${excelProgramStr.toUpperCase()}${nameSlug}`; 

    // --- START: SEMESTER ASSIGNMENT (Default to 1) ---
    // Excel data might have a semester, but we default to 1 as per the new form
    let semesterValue = 1; 

    // 3. Prepare the final data object
    data = { 
      name: excelUser.Name,
      department: excelUser.Department,
      program: excelUser.Program,  
      semester: semesterValue, // Hardcoded to 1
      
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
    console.error("Registration Error:", err);
    res.status(500).send("Internal Server Error");
  }
});

// Login user
app.post("/login", async (req, res) => {
  try {
    const { hostelid, password } = req.body;

    // Find user by hostelid
    const user = await User.findOne({ hostelid });
    if (!user) {
      return res.send("<script>alert('User not found'); window.location.href='/login';</script>");
    }

    // Compare password using bcrypt
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.send("<script>alert('Wrong password'); window.location.href='/login';</script>");
    }

    // Store only hostelid (not full user object)
    req.session.userId = user.hostelid;

    // (Optional but recommended) Store role for route-level protection
    req.session.role = user.role;

    // Redirect based on role
    if (user.role === "admin") {
      return res.redirect("/admin/dashboard");
    } else {
      return res.redirect("/user/dashboard");
    }
  } catch (err) {
    console.error("Login error:", err.message);
    res.status(500).send("Internal Server Error");
  }
});


// Logout
app.get("/logout", (req, res) => {
    // Explicitly set session data to null before destroying
    req.session.userId = null;
    req.session.role = null; 
    
    // Destroy the current session
    req.session.destroy((err) => {
        if (err) {
            console.error("Logout error:", err);
            return res.status(500).send("Error logging out.");
        }
        // CRITICAL: Clear the cookie to prevent ghost sessions in the browser
        res.clearCookie('connect.sid');
        
        // Redirect to the homepage/login after successful destruction
        res.redirect("/"); 
    });
});

// Mount routes
app.use("/admin", adminRoutes);
app.use("/user", userRoutes); 

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
