// routes/users.js - Handles all routes related to user registration, login, profile viewing, and logout.

const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const bcrypt = require('bcrypt');
const { getUserReviews, getUserReviewSummary } = require('../helpers/reviews');

// GET /users/register
// Renders the registration form for new users to create an account.
router.get('/register', (req, res) => {
  res.render('register');
});

// POST /users/register
// Handles the form submission for user registration. It takes the user information from the form, validates it (including checking for a valid zip code), hashes the password, and inserts the new user into the database. If the email is already registered or if there's any error during the process, it catches the error and renders a message page with an appropriate error message.
router.post('/register', async (req, res) => {
  const { name, email, password, bio, zip_code, profile_image_url } = req.body;

  const cleanedZip = zip_code.trim();

  if (!/^\d{5}$/.test(cleanedZip)) {
    return res.render('message', {
      title: 'Invalid Zip Code',
      message: 'Zip code must be exactly 5 digits.',
      actionText: 'Try Again',
      actionHref: '/users/register'
    });
}

  try {
  const passwordHash = await bcrypt.hash(password, 10);

    await pool.query(
      `INSERT INTO users (name, email, password_hash, bio, zip_code, profile_image_url)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [name, email, passwordHash, bio, cleanedZip, profile_image_url || null]
    );

    res.redirect('/users/login');
  } catch (err) {
    console.error(err);

    if (err.code === '23505') {
      return res.render('message', {
        title: 'Email Already Exists',
        message: 'The email you entered is already registered.',
        actionText: 'Try Again',
        actionHref: '/users/register'
      });
    }

    res.render('message', {
      title: 'Error Creating User',
      message: 'An error occurred while creating the user.',
      actionText: 'Try Again',
      actionHref: '/users/register'
    });
  }
});

// GET /users/login
// Renders the login form for existing users to log in to their account.
router.get('/login', (req, res) => {
  res.render('login');
});

// POST /users/login
// Handles the form submission for user login. It takes the email and password from the form, checks if a user with that email exists, and if so, compares the provided password with the stored password hash. If the credentials are valid, it creates a session for the user and redirects to the homepage. If the credentials are invalid or if there's an error during the process, it catches the error and renders a message page with an appropriate error message.
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    const result = await pool.query(
      'SELECT * FROM users WHERE email = $1',
      [email]
    );

    if (result.rows.length === 0) {
      return res.render('message', {
        title: 'User Not Found',
        message: 'No user found with that email.',
        actionText: 'Try Again',
        actionHref: '/users/login'
      });
    }

    const user = result.rows[0];

    const passwordMatch = await bcrypt.compare(password, user.password_hash);

    if (!passwordMatch) {
      return res.render('message', {
        title: 'Incorrect Password',
        message: 'The password you entered is incorrect.',
        actionText: 'Try Again',
        actionHref: '/users/login'
      });
    }

    req.session.userId = user.user_id;
    req.session.userName = user.name;

    res.redirect('/');
  } catch (err) {
    console.error(err);
    res.render('message', {
      title: 'Login Error',
      message: 'An error occurred while logging in.',
      actionText: 'Try Again',
      actionHref: '/users/login'
    });
  }
});

// POST /users/logout
// Handles user logout by destroying the user's session and redirecting to the homepage.
router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/');
  });
});

// GET /users
// Renders a list of all users. If zip code and radius query parameters are provided, it filters the users to only show those within the specified radius of the given zip code.
const zipcodes = require('zipcodes');

router.get('/', async (req, res) => {
  try {
    const { zip_code, radius } = req.query;

    const result = await pool.query(`
      SELECT 
        users.user_id,
        users.name,
        users.bio,
        users.zip_code,
        users.profile_image_url,
        users.created_at,
        ROUND(AVG(reviews.rating)::numeric, 1) AS average_rating,
        COUNT(reviews.review_id) AS review_count
      FROM users
      LEFT JOIN reviews ON users.user_id = reviews.reviewed_user_id
      GROUP BY users.user_id
      ORDER BY users.created_at DESC
    `);

    let users = result.rows;

    if (zip_code && radius) {
      users = users
        .map(user => {
          if (!user.zip_code) return null;

          const distance = Math.round(zipcodes.distance(zip_code, user.zip_code));

          if (distance > Number(radius)) return null;

          return {
            ...user,
            distance
          };
        })
        .filter(Boolean)
        .sort((a, b) => a.distance - b.distance);
    }

    res.render('users', {
      users,
      currentZip: zip_code || '',
      currentRadius: radius || ''
    });

  } catch (err) {
    console.error(err);
    res.send('Error retrieving users');
  }
});

// GET /users/:id/edit
// Renders the form for editing a user's profile. Only accessible to the logged-in user who owns the profile.
router.get('/:id/edit', async (req, res) => {
  if (!req.currentUserId) {
    return res.render('message', {
      title: 'Login Required',
      message: 'You must be logged in to edit your profile.',
      actionText: 'Login',
      actionHref: '/users/login'
    });
  }

  const { id } = req.params;

  if (Number(id) !== Number(req.currentUserId)) {
    return res.render('message', {
      title: 'Access Denied',
      message: 'You can only edit your own profile.',
      actionText: 'Back to Profile',
      actionHref: `/users/${req.currentUserId}`
    });
  }

  try {
    const result = await pool.query(
      'SELECT user_id, name, email, bio, zip_code, profile_image_url FROM users WHERE user_id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return res.render('message', {
        title: 'User Not Found',
        message: 'The user you are trying to edit does not exist.',
        actionText: 'Back to Users',
        actionHref: '/users'
      });
    }

    res.render('edit-profile', {
      user: result.rows[0]
    });
  } catch (err) {
    console.error(err);
    res.send('Error loading edit profile form');
  }
});

// POST /users/:id/edit
// Handles the form submission for editing a user's profile. It takes the updated user information from the form, validates it (including checking for a valid zip code), and updates the user's profile in the database. Only the logged-in user who owns the profile can perform this action. If there's an error during the process, it catches the error and renders a message page with an appropriate error message.
router.post('/:id/edit', async (req, res) => {
  if (!req.currentUserId) {
    return res.render('message', {
      title: 'Login Required',
      message: 'You must be logged in to edit your profile.',
      actionText: 'Login',
      actionHref: '/users/login'
    });
  }

  const { id } = req.params;
  const { name, bio, zip_code, profile_image_url } = req.body;
  const cleanedZip = zip_code.trim();

  if (!/^\d{5}$/.test(cleanedZip)) {
    return res.render('message', {
      title: 'Invalid Zip Code',
      message: 'Zip code must be exactly 5 digits.',
      actionText: 'Try Again',
      actionHref: `/users/${id}/edit`
    });
  }

  if (Number(id) !== Number(req.currentUserId)) {
    return res.render('message', {
      title: 'Access Denied',
      message: 'You can only edit your own profile.',
      actionText: 'Back to Profile',
      actionHref: `/users/${req.currentUserId}`
    });
  }

  try {
    await pool.query(
      `
      UPDATE users
      SET name = $1,
          bio = $2,
          zip_code = $3,
          profile_image_url = $4,
          updated_at = CURRENT_TIMESTAMP
      WHERE user_id = $5
      `,
      [name, bio, cleanedZip, profile_image_url || null, id]
    );

    req.session.userName = name;

    res.redirect(`/users/${id}`);
  } catch (err) {
    console.error(err);
    res.send('Error updating profile');
  }
});

// GET /users/:id
// Renders the profile page for a specific user. It retrieves the user's information, reviews, tools, skills, and listings from the database. If the user does not exist or if there's an error during the process, it catches the error and renders a message page with an appropriate error message.
router.get('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const userResult = await pool.query(
      'SELECT * FROM users WHERE user_id = $1',
      [id]
    );

    if (userResult.rows.length === 0) {
      return res.render('message', {
        title: 'User Not Found',
        message: 'The user you are trying to view does not exist.',
        actionText: 'Back to Users',
        actionHref: '/users'
      });
    }

    const reviews = await getUserReviews(id);
    const { averageRating, reviewCount } = await getUserReviewSummary(id);

    const toolsResult = await pool.query(
      `
      SELECT *
      FROM tools
      WHERE user_id = $1
      ORDER BY created_at DESC
      `,
      [id]
    );

    const skillsResult = await pool.query(
      `
      SELECT *
      FROM skills
      WHERE user_id = $1
      ORDER BY created_at DESC
      `,
      [id]
    );

    const listingsResult = await pool.query(
      `
      SELECT *
      FROM listings
      WHERE user_id = $1
      ORDER BY created_at DESC
      `,
      [id]
    );

    const activeListings = listingsResult.rows.filter(
      listing => listing.status !== 'unavailable'
    );

    const archivedListings = listingsResult.rows.filter(
      listing => listing.status === 'unavailable'
    );

    res.render('profile', {
      user: userResult.rows[0],
      reviews,
      averageRating,
      reviewCount,
      tools: toolsResult.rows,
      skills: skillsResult.rows,
      listings: activeListings,
      archivedListings
    });

  } catch (err) {
    console.error(err);
    res.render('message', {
      title: 'Error',
      message: 'An error occurred while retrieving the profile.',
      actionText: 'Back to Users',
      actionHref: '/users'
    });
  }
});

module.exports = router;