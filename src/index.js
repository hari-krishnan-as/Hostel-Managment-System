const express = require("express");
const path = require("path");
const bcrypt = require("bcrypt");
const session = require("express-session");
const collection = require("./config"); // Your mongoose model
const app = express();

// ✅ Convert data into JSON format
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// ✅ Configure session middleware
app.use(
  session({
    secret: "your_secret_key", // Use a strong, secret key in production
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false }, // Set true if using HTTPS
  })
);

// ✅ Set view engine
app.set("view engine", "hbs");
app.set("views", path.join(__dirname, "../views"));

// ✅ Middleware to serve static files
app.use(express.static(path.join(__dirname, "../public")));

const hbs = require("hbs");

// ✅ Attendance calculator function (backend use)
function calculateAttendanceDays(registrationDate, leaves = []) {
  const today = new Date();
  const regDate = new Date(registrationDate);

  // Total days since registration
  const totalDays =
    Math.floor((today - regDate) / (1000 * 60 * 60 * 24)) + 1;

  // Count leave days
  let offDays = 0;
  leaves.forEach((leave) => {
    const from = new Date(leave.from);
    const to = new Date(leave.to);
    const diff =
      Math.floor((to - from) / (1000 * 60 * 60 * 24)) + 1;
    offDays += diff;
  });

  const presentDays = totalDays - offDays;
  return { presentDays, offDays };
}

// ✅ Handlebars helper for calculating days between leave dates
hbs.registerHelper("calcDays", function (from, to) {
  const start = new Date(from);
  const end = new Date(to);

  if (isNaN(start) || isNaN(end)) {
    return "N/A";
  }

  const diff = Math.floor((end - start) / (1000 * 60 * 60 * 24)) + 1;
  return diff;
});

// ✅ Middleware to protect routes
const isAuthenticated = (req, res, next) => {
  if (req.session.userId) {
    next();
  } else {
    res.redirect("/login");
  }
};

// ================= ROUTES =================

// ✅ Home
app.get("/", (req, res) => {
  res.render("home");
});

// ✅ Login
app.get("/login", (req, res) => {
  res.render("login");
});

// ✅ Register Request Form
app.get("/request", (req, res) => {
  res.render("request");
});

// ✅ Logout
app.get("/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error(err);
      return res.send(
        "<script>alert('Logout failed'); window.location.href='/student-dashboard';</script>"
      );
    }
    res.redirect("/");
  });
});

// ✅ Student Dashboard
app.get("/student-dashboard", isAuthenticated, async (req, res) => {
  try {
    const user = await collection.findOne({
      hostelid: req.session.userId,
    });
    if (user) {
      res.render("user/student_dashboard", { name: user.name });
    } else {
      res.redirect("/login");
    }
  } catch (error) {
    console.error(error);
    res.send(
      "<script>alert('Something went wrong'); window.location.href='/login';</script>"
    );
  }
});

// ✅ Admin Dashboard
app.get("/admin-dashboard", isAuthenticated, async (req, res) => {
  try {
    const user = await collection.findOne({
      hostelid: req.session.userId,
    });
    if (user && user.role === "admin") {
      res.render("admin/admin_dashboard", { name: user.name });
    } else {
      res.redirect("/login");
    }
  } catch (error) {
    console.error(error);
    res.send(
      "<script>alert('Something went wrong'); window.location.href='/login';</script>"
    );
  }
});

// ✅ Mess Cut Form (GET)
app.get("/mess-cut", isAuthenticated, async (req, res) => {
  try {
    const user = await collection.findOne({ hostelid: req.session.userId });

    if (!user) return res.redirect("/login");

    res.render("user/mess-cut", {
      name: user.name,
      leaves: user.leaves || []   // 👈 send leaves to hbs
    });
  } catch (err) {
    console.error(err);
    res.send("<script>alert('Error loading mess cut page'); window.location.href='/student-dashboard';</script>");
  }
});

//complients
app.get("/complaints", isAuthenticated, async (req, res) => {
  try {
    const user = await collection.findOne({ hostelid: req.session.userId });

    if (!user) return res.redirect("/login");

    res.render("user/complaints", {
      name: user.name,
      complaints: user.complaints || []
    });
  } catch (err) {
    console.error(err);
    res.send("<script>alert('Error loading complaints page'); window.location.href='/student-dashboard';</script>");
  }
});
app.post("/complaints", isAuthenticated, async (req, res) => {
  try {
    const { complaint } = req.body;
    const user = await collection.findOne({ hostelid: req.session.userId });

    if (!user) return res.redirect("/login");

    user.complaints.push({
      text: complaint,
      date: new Date(),
      status: "Pending"
    });

    await user.save();

    res.send("<script>alert('Complaint submitted successfully'); window.location.href='/complaints';</script>");
  } catch (err) {
    console.error(err);
    res.send("<script>alert('Failed to submit complaint'); window.location.href='/complaints';</script>");
  }
});

// ✅ Show Suggestions Page
// ✅ Show Suggestions Page
app.get("/suggestions", isAuthenticated, async (req, res) => {
  try {
    const user = await collection.findOne({ hostelid: req.session.userId });

    if (!user) return res.redirect("/login");

    res.render("user/suggestions", {
      name: user.name,
      suggestions: user.suggestions || []
    });
  } catch (err) {
    console.error(err);
    res.status(500).send("Error loading suggestions");
  }
});

// ✅ Handle Suggestion Submit
app.post("/suggestions", isAuthenticated, async (req, res) => {
  try {
    const { suggestion } = req.body;
    const user = await collection.findOne({ hostelid: req.session.userId });

    if (!user) return res.redirect("/login");

    user.suggestions.push({ text: suggestion });
    await user.save();

    res.send("<script>alert('Suggestion submitted successfully'); window.location.href='/suggestions';</script>");
  } catch (err) {
    console.error(err);
    res.status(500).send("Error submitting suggestion");
  }
});


// ✅ Apply Mess Cut Leave (POST)
app.post("/apply-mess-cut", isAuthenticated, async (req, res) => {
  try {
    const { startDate, endDate } = req.body;
    const user = await collection.findOne({ hostelid: req.session.userId });

    if (!user) return res.redirect("/login");

    // Add leave
    user.leaves.push({
      from: new Date(startDate),
      to: new Date(endDate),
    });

    await user.save();

    res.send(
      "<script>alert('Mess cut leave applied successfully'); window.location.href='/mess-cut';</script>"
    );
  } catch (error) {
    console.error(error);
    res.send(
      "<script>alert('Something went wrong'); window.location.href='/mess-cut';</script>"
    );
  }
});

// ✅ Attendance
app.get("/attendance", isAuthenticated, async (req, res) => {
  try {
    const user = await collection.findOne({
      hostelid: req.session.userId,
    });

    if (user) {
      const { presentDays, offDays } = calculateAttendanceDays(
        user.registrationDate,
        user.leaves || []
      );

      res.render("user/attendance", {
        name: user.name,
        presentDays,
        offDays,
        leaves: user.leaves || [], // pass leave history to frontend
      });
    } else {
      res.redirect("/login");
    }
  } catch (error) {
    console.error(error);
    res.send(
      "<script>alert('Something went wrong'); window.location.href='/login';</script>"
    );
  }
});

// ✅ Register user
app.post("/request", async (req, res) => {
  const data = {
    name: req.body.name,
    department: req.body.department,
    semester: req.body.semester,
    hostelid: req.body.hostelid,
    password: req.body.password,
    role: req.body.role || "student",
    registrationDate: req.body.registrationDate,
  };

  const existinguser = await collection.findOne({
    hostelid: data.hostelid,
  });
  if (existinguser) {
    res.send(
      "<script>alert('Hostelid already exists. Please try a different hostelid.'); window.location.href='/request';</script>"
    );
  } else {
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(data.password, saltRounds);
    data.password = hashedPassword;

    await collection.create(data);
    res.redirect("/login");
  }
});

// ✅ Login user
app.post("/login", async (req, res) => {
  try {
    const user = await collection.findOne({
      hostelid: req.body.hostelid,
    });

    if (!user) {
      return res.send(
        "<script>alert('User not found'); window.location.href='/login';</script>"
      );
    }

    const isPasswordMatch = await bcrypt.compare(
      req.body.password,
      user.password
    );

    if (isPasswordMatch) {
      req.session.userId = user.hostelid;
      if (user.role === "admin") {
        return res.redirect("/admin-dashboard");
      } else {
        return res.redirect("/student-dashboard");
      }
    } else {
      return res.send(
        "<script>alert('Wrong Password'); window.location.href='/login';</script>"
      );
    }
  } catch (error) {
    console.error(error);
    return res.send(
      "<script>alert('Something went wrong'); window.location.href='/login';</script>"
    );
  }
});

// ✅ Server listen
const port = 3000;
app.listen(port, () => {
  console.log(`Server running on port: ${port}`);
});
