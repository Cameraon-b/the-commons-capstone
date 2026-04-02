const express = require("express");
const path = require("path");
require("dotenv").config();

const listingsRoutes = require("./routes/listings");

const app = express();
const PORT = process.env.PORT || 3000;

// middleware
app.use(express.urlencoded({ extended: true }));

// static files (IMPORTANT: your public is inside src)
app.use(express.static(path.join(__dirname, "public")));

// view engine
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// test route
app.get("/", (req, res) => {
  res.render("index");
});

app.use("/listings", listingsRoutes);


app.listen(PORT, () => {
  console.log(`Commons running on http://localhost:${PORT}`);
});