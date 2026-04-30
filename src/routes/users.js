// routes/users.js - Handles all routes related to user registration, login, profile viewing, and logout.

const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const bcrypt = require('bcrypt');
const { getUserReviews, getUserReviewSummary } = require('../helpers/reviews');

// GET /users/register
router.get('/register', (req, res) => {
  res.render('register');
});

// POST /users/register
router.post('/register', async (req, res) => {
  const { name, email, password, bio, zip_code, profile_image_url } = req.body;

  try {
  const passwordHash = await bcrypt.hash(password, 10);

    await pool.query(
      `INSERT INTO users (name, email, password_hash, bio, zip_code, profile_image_url)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [name, email, passwordHash, bio, zip_code, profile_image_url || null]
    );

    res.redirect('/users/login');
  } catch (err) {
    console.error(err);

    if (err.code === '23505') {
      return res.send(`
        <h2>Email already exists</h2>
        <a href="/users/register">Go back</a>
      `);
    }

    res.send('Error creating user');
  }
});

// GET /users/login
router.get('/login', (req, res) => {
  res.render('login');
});

// POST /users/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    const result = await pool.query(
      'SELECT * FROM users WHERE email = $1',
      [email]
    );

    if (result.rows.length === 0) {
      return res.send(`
        <h2>No user found with that email</h2>
        <a href="/users/login">Try again</a>
      `);
    }

    const user = result.rows[0];

    const passwordMatch = await bcrypt.compare(password, user.password_hash);

    if (!passwordMatch) {
      return res.send(`
        <h2>Incorrect password</h2>
        <a href="/users/login">Try again</a>
      `);
    }

    req.session.userId = user.user_id;
    req.session.userName = user.name;

    res.redirect('/');
  } catch (err) {
    console.error(err);
    res.send('Login error');
  }
});

// POST /users/logout
router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/');
  });
});

// GET /users
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
      return res.status(404).send('User not found');
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
      [name, bio, zip_code, profile_image_url || null, id]
    );

    req.session.userName = name;

    res.redirect(`/users/${id}`);
  } catch (err) {
    console.error(err);
    res.send('Error updating profile');
  }
});

// GET /users/:id
router.get('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const userResult = await pool.query(
      'SELECT * FROM users WHERE user_id = $1',
      [id]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).send('User not found');
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
    res.send('Error retrieving profile');
  }
});

module.exports = router;