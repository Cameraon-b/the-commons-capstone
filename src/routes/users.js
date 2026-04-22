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
  const { name, email, password, bio, zip_code } = req.body;

  try {
  const passwordHash = await bcrypt.hash(password, 10);

    await pool.query(
      `INSERT INTO users (name, email, password_hash, bio, zip_code)
       VALUES ($1, $2, $3, $4, $5)`,
      [name, email, passwordHash, bio, zip_code]
    );

    res.redirect('/users');
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
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM users ORDER BY created_at DESC'
    );
    res.render('users', { users: result.rows });
  } catch (err) {
    console.error(err);
    res.send('Error retrieving users');
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

    res.render('profile', {
      user: userResult.rows[0],
      reviews,
      averageRating,
      reviewCount,
      tools: toolsResult.rows,
      skills: skillsResult.rows,
      listings: listingsResult.rows
    });

  } catch (err) {
    console.error(err);
    res.send('Error retrieving profile');
  }
});

module.exports = router;