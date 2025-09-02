const express = require("express");
const path = require("path");
const bcrypt = require("bcrypt");
const collection = require("./config")
const app = express();
//convert data into json format
app.use(express.json());
app.use(express.urlencoded({extended: false}));
// set view engine
app.set('view engine', 'hbs');
app.set('views', path.join(__dirname, '../views')); // path correction
// middleware to serve static files
app.use(express.static(path.join(__dirname, '../public')));
app.get("/", (req, res) => {
    res.render("home");
})
app.get("/login", (req, res) => {
    res.render("login");
});
app.get("/request", (req, res) => {
    res.render("request");
});
app.get("/student-dashboard", (req, res) => {
  res.render("student_dashboard" ); // matches student_dashboard.hbs
});
app.get("/admin-dashboard", (req, res) => {
  res.render("admin_dashboard"); // matches admin_dashboard.hbs
});

//register user
app.post("/request", async (req, res) => {
    const data ={
        name:req.body.name,
        department:req.body.department,
        semester:req.body.semester,
        hostelid:req.body.hostelid,
        password:req.body.password,
        role: req.body.role || "student"
    };
    const existinguser = await collection.findOne({hostelid: data.hostelid});
    if(existinguser){
        res.send("<script>alert('Hostelid already exists. Please try a different hostelid.'); window.location.href='/request';</script>");
    }
    else{
        //hash password using bcrypt method
        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(data.password,saltRounds);
        data.password = hashedPassword //replace hashed password with original password

        const userdata = await collection.create(data);
        console.log(userdata);
        res.redirect("/login");
    } 
});
// login user
// ...
app.post("/login", async (req, res) => {
    try {
        const check = await collection.findOne({ hostelid: req.body.hostelid });

        if (!check) {
            return res.send("<script>alert('User not found'); window.location.href='/login';</script>");
        }

        const isPasswordMatch = await bcrypt.compare(req.body.password, check.password);

        if (isPasswordMatch) {
            if (check.role === "admin") {
                // Corrected: Use res.render() to pass data
                return res.render("admin_dashboard", { name: check.name });
            } else {
                // Corrected: Use res.render() to pass data
                return res.render("student_dashboard", { name: check.name });
            }
        } else {
            return res.send("<script>alert('Wrong Password'); window.location.href='/login';</script>");
        }
    } catch (error) {
        console.error(error);
        return res.send("<script>alert('Something went wrong'); window.location.href='/login';</script>");
    }
});
const port = 3000;
app.listen(port, () => {
    console.log(`Server running on port: ${port}`);
});
