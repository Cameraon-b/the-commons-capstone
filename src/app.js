const express = require("express");
const path = require("path");
const session = require("express-session");
require("dotenv").config();

const listingsRoutes = require("./routes/listings");
const usersRoutes = require("./routes/users");
const requestsRoutes = require("./routes/requests");

const app = express();
const PORT = process.env.PORT || 3000;

// middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

app.use(session({
  secret: "commons-secret-key",
  resave: false,
  saveUninitialized: false
}));

// current user from session
app.use((req, res, next) => {
  req.currentUserId = req.session.userId || null;
  res.locals.currentUserId = req.session.userId || null;
  res.locals.currentUserName = req.session.userName || null;
  next();
});

// view engine
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// routes
app.get("/", (req, res) => {
  res.render("index");
});

app.use("/listings", listingsRoutes);
app.use("/users", usersRoutes);
app.use("/requests", requestsRoutes);

app.listen(PORT, () => {
  console.log(`Commons running on http://localhost:${PORT}`);
});