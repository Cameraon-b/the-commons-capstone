// This file sets up the Express application, including middleware for parsing request bodies, serving static files, and managing user sessions. It also defines the routes for the application, including the home page and routes for listings, users, and requests. The application listens on a specified port and logs a message when it is running.

// During development, AI tools (ChatGPT & Copilot) were used as a support resource for generating initial code examples, troubleshooting issues, and exploring design ideas.

const express = require("express");
const path = require("path");
const session = require("express-session");
require("dotenv").config();

const listingsRoutes = require("./routes/listings");
const usersRoutes = require("./routes/users");
const requestsRoutes = require("./routes/requests");
const reviewsRoutes = require("./routes/reviews");
const toolRoutes = require('./routes/tools');
const skillRoutes = require('./routes/skills');
const notificationsRoutes = require('./routes/notifications');
const attachNotificationCount = require('./middleware/notificationCount');

const app = express();
const PORT = process.env.PORT || 3000;

const pool = require("./config/db");

function formatTimestamp(date) {
  if (!date) return "";

  const d = new Date(date);
  if (isNaN(d)) return "";

  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function formatDate(date) {
  if (!date) return "";

  const d = new Date(date);
  if (isNaN(d)) return "";

  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}

function formatJoinDate(date) {
  if (!date) return "";

  const d = new Date(date);
  if (isNaN(d)) return "";

  return d.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric"
  });
}

// middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false
}));

app.locals.formatTimestamp = formatTimestamp;
app.locals.formatDate = formatDate;
app.locals.formatJoinDate = formatJoinDate;

// current user from session
app.use((req, res, next) => {
  req.currentUserId = req.session.userId || null;
  res.locals.currentUserId = req.session.userId || null;
  res.locals.currentUserName = req.session.userName || null;
  next();
});

app.use(attachNotificationCount);

// view engine
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// routes
app.get("/", async (req, res) => {
  try {
    const featuredResult = await pool.query(`
      SELECT listing_id, title, image_url
      FROM listings
      WHERE image_url IS NOT NULL
        AND LOWER(status) = 'available'
      ORDER BY RANDOM()
      LIMIT 3
    `);

    res.render("index", {
      featuredListings: featuredResult.rows
    });
  } catch (err) {
    console.error(err);
    res.render("index", {
      featuredListings: []
    });
  }
});

app.use("/listings", listingsRoutes);
app.use("/users", usersRoutes);
app.use("/requests", requestsRoutes);
app.use("/reviews", reviewsRoutes);
app.use("/tools", toolRoutes);
app.use("/skills", skillRoutes);
app.use("/notifications", notificationsRoutes);
app.listen(PORT, () => {
  console.log(`Commons running on http://localhost:${PORT}`);
});

