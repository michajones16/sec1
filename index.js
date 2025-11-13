// ==============================================
// Required Node.js Modules
// ==============================================

// npm install dotenv
// dotenv allows you to store sensitive data (like passwords, API keys, etc.)
// in a separate .env file, which is NOT uploaded to GitHub or shared publicly.
require('dotenv').config();

// npm install express
// Express is a lightweight web application framework for Node.js
const express = require("express");

// npm install express-session
// express-session lets your app remember information between requests
// (e.g., whether a user is logged in). Sessions are stored on the server.
const session = require("express-session");

// Path is a built-in Node.js module to work with file and directory paths
const path = require("path");

const multer = require("multer");

// npm install body-parser
// body-parser lets you read (parse) data from the body of incoming HTTP requests
// (e.g., form submissions). In modern Express, this is built-in, but still common to use explicitly.
const bodyParser = require("body-parser");

// Create an instance of the Express app
const app = express();

// ==============================================
// Application Settings
// ==============================================

// Tell Express to use EJS as the templating engine
// EJS (Embedded JavaScript) allows you to inject JavaScript directly into HTML pages
// All views should be stored in a folder named "views" and use .ejs extension
app.set("view engine", "ejs");

// Root directory for static images
const uploadRoot = path.join(__dirname, "images");
// Sub-directory where uploaded profile pictures will be stored
const uploadDir = path.join(uploadRoot, "uploads");
// cb is the callback function
// The callback is how you hand control back to Multer after
// your customization step
// Configure Multer's disk storage engine
// Multer calls it once per upload to ask where to store the file. Your function receives:
// req: the incoming request.
// file: metadata about the file (original name, mimetype, etc.).
// cb: the callback.
const storage = multer.diskStorage({
    // Save files into our uploads directory
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    // Reuse the original filename so users see familiar names
    filename: (req, file, cb) => {
        cb(null, file.originalname);
    }
});
// Create the Multer instance that will handle single-file uploads
const upload = multer({ storage });

// Expose everything in /images (including uploads) as static assets
app.use("/images", express.static(uploadRoot));

app.use("/images", express.static(path.join(__dirname, "images")));

// Choose a port for the web server to listen on
// process.env.PORT is used automatically when deploying (like on Render or Heroku)
// 3000 is used as a default for local testing
const port = process.env.PORT || 3000;

// ==============================================
// Session Configuration
// ==============================================

/*
Middleware = functions that run between receiving a request and sending a response.
You can use middleware to:
  - log requests
  - check authentication
  - parse request bodies
  - handle sessions

Session middleware settings:

secret (required):
  - Used to sign and encrypt the session ID cookie so it can't be tampered with.

resave (optional, default: true):
  - true = forces the session to be saved on every request.
  - false = only saves if session data changes (recommended).

saveUninitialized (optional, default: true):
  - true = saves a session even if it's empty.
  - false = only creates a session when something is stored (recommended).
*/

app.use(
  session({
    secret: process.env.SESSION_SECRET || 'fallback-secret-key',
    resave: false,
    saveUninitialized: false,
  })
);

// ==============================================
// Database Connection (using Knex.js)
// ==============================================

// npm install knex pg
// Knex.js is a SQL query builder — helps you talk to your database more easily
// 'pg' is the PostgreSQL driver

const knex = require("knex")({
  client: "pg", // Using PostgreSQL
  connection: {
    host: process.env.DB_HOST || "localhost",
    user: process.env.DB_USER || "postgres",
    password: process.env.DB_PASSWORD || "12345",
    database: process.env.DB_NAME || "foodisus",
    port: process.env.DB_PORT || "5432"
  }
});

// ==============================================
// Middleware Setup
// ==============================================

// Parse URL-encoded data (like from an HTML <form>)
// This allows req.body.username or req.body.password to work
app.use(express.urlencoded({ extended: true }));

// ==============================================
// Authentication Middleware (Global)
// ==============================================

// This middleware runs on *every request* to check if the user is logged in.
// It decides whether to let the request continue or send the user to login.

app.use((req, res, next) => {
  // Skip authentication check for public routes
  if (req.path === '/' || req.path === '/login' || req.path === '/logout') {
    return next(); // Skip to the next handler
  }

  // For all other routes, make sure the user is logged in
  if (req.session.isLoggedIn) {
    // User is authenticated — continue to the requested route
    next();
  } else {
    // User not logged in — show login page with error
    res.render("login", { error_message: "Please log in to access this page" });
  }
});

// ==============================================
// Routes
// ==============================================

// Home page route
app.get("/", (req, res) => {
  if (req.session.isLoggedIn) {
    // If logged in, render the main index page
    res.render("index");
  } else {
    // Otherwise, show the login form
    res.render("login", { error_message: "" });
  }
});

// Handle login form submissions
app.post("/login", (req, res) => {
  // Get data from the form (HTML input names: username, password)
  let sName = req.body.username;
  let sPassword = req.body.password;

  // Query the users table for a matching username & password
  knex
    .select("username", "password")
    .from("users")
    .where("username", sName)
    .andWhere("password", sPassword)
    .then(users => {
      // If a user is found, log them in
      if (users.length > 0) {
        // Store login state and username in the session
        req.session.isLoggedIn = true;
        req.session.username = sName;
        // Redirect to home page
        res.redirect("/");
      } else {
        // Invalid credentials — show error
        res.render("login", { error_message: "Invalid login" });
      }
    })
    .catch(err => {
      // If something goes wrong with the database
      console.error("Login error:", err);
      res.render("login", { error_message: "Invalid login" });
    });
});

// Logout route
app.get("/logout", (req, res) => {
  // Destroy the current session (log the user out)
  req.session.destroy((err) => {
    if (err) {
      console.log(err);
    }
    // Redirect to home page (which shows login form)
    res.redirect("/");
  });
});

app.get("/addUser", (req, res) => {
  res.render("addUser");
});

app.post("/addUser", upload.single("profileImage"), (req, res) => {
    // Destructuring grabs them regardless of field order.
    const { username, password } = req.body;
    // Basic validation to ensure required fields are present.
    if (!username || !password) {
        return res.status(400).render("addUser", { error_message: "Username and password are required." });
    }
    // Build the relative path to the uploaded file so the
    // browser can load it later.
    const profileImagePath = req.file ? `/images/uploads/${req.file.filename}` : null;
    // Shape the data to match the users table schema.
    // Object literal - other languages use dictionaries
    // When the object is inserted with Knex, that value profileImagePath,
    // becomes the database column profile_image, so the saved path to
    // the uploaded image ends up in the profile_image column for that user.
    const newUser = {
        username,
        password,
        profile_image: profileImagePath
    };
    // Insert the record into PostgreSQL and return the user list on success.
    knex("users")
        .insert(newUser)
        .then(() => {
            res.redirect("/users");
        })
        .catch((dbErr) => {
            console.error("Error inserting user:", dbErr.message);
            // Database error, so show the form again with a generic message.
            res.status(500).render("addUser", { error_message: "Unable to save user. Please try again." });
        });
});

app.get("/test", (req, res) => {
  //Check if user is logged in
  if (req.session.isLoggedIn) {
    res.render("test", {name : "BYU"});
  }
  else {
    res.render("login", { error_message: "" });
  }
});

app.get("/users", (req, res) => {
  // Check if user is logged in
  if (req.session.isLoggedIn) {
    knex.select().from("users")
      .then(users => {
        console.log(`Successfully retrieved ${users.length} users from database`);
        res.render("displayUsers", {users: users});
      })
      .catch((err) => {
        console.error("Database query error:", err.message);
        res.render("displayUsers", {
          users: [],
          error_message: `Database error: ${err.message}. Please check if the 'users' table exists.`
        });
      });
  }
  else {
    res.render("login", { error_message: "" });
  }
});

// Simple test page (e.g., to verify session middleware works)
app.get("/t", (req, res) => {
  res.render("test");
});

app.post("/deleteUser/:id", (req, res) => {
    knex("users").where("id", req.params.id).del().then(users => {
        res.redirect("/users");
    }).catch(err => {
        console.log(err);
        res.status(500).json({err});
    })
});

// ==============================================
// Start the Web Server
// ==============================================

app.listen(port, () => {
  console.log(`The server is listening on port ${port}`);
});