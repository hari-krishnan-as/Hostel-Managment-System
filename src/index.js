const express = require("express");
const path = require("path");
const session = require("express-session");
const hbs = require("hbs");

const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Session setup
app.use(
  session({
    secret: "your_secret_key",
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false },
  })
);

// Views setup
app.set("view engine", "hbs");
app.set("views", path.join(__dirname, "../views"));
app.use(express.static(path.join(__dirname, "../public")));

// Register Handlebars helpers
hbs.registerHelper("calcDays", (from, to) => {
  const start = new Date(from);
  const end = new Date(to);
  if (isNaN(start) || isNaN(end)) return "N/A";
  return Math.floor((end - start) / (1000 * 60 * 60 * 24)) + 1;
});

// Import routes
const adminRoutes = require("./admin/adminRoutes");
const userRoutes = require("./user/userRoutes");
const collection = require("./config"); // model
const bcrypt = require("bcrypt");

// Default routes
app.get("/", (req, res) => res.render("home"));
app.get("/login", (req, res) => res.render("login"));
app.get("/request", (req, res) => res.render("request"));

// Add a redirect for the incorrect attendance path
app.get("/attendance", (req, res) => {
    res.redirect("/user/attendance");
});

// Register user
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

  const existinguser = await collection.findOne({ hostelid: data.hostelid });
  if (existinguser) {
    res.send("<script>alert('Hostelid already exists.'); window.location.href='/request';</script>");
  } else {
    data.password = await bcrypt.hash(data.password, 10);
    await collection.create(data);
    res.redirect("/login");
  }
});

// Login user
app.post("/login", async (req, res) => {
  const user = await collection.findOne({ hostelid: req.body.hostelid });
  if (!user) return res.send("<script>alert('User not found'); window.location.href='/login';</script>");

  const isMatch = await bcrypt.compare(req.body.password, user.password);
  if (!isMatch) return res.send("<script>alert('Wrong Password'); window.location.href='/login';</script>");

  req.session.userId = user.hostelid;
  if (user.role === "admin") return res.redirect("/admin/dashboard");
  else return res.redirect("/user/dashboard");
});

// Logout
app.get("/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/"));
});

// Mount routes
app.use("/admin", adminRoutes);
app.use("/user", userRoutes);

// Start server
const PORT = 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));