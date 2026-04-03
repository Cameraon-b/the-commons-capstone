const express = require('express');
const router = express.Router();
const pool = require('../config/db');

// GET /users/register
router.get('/register', (req, res) => {
  res.render('register');
});

// POST /users/register
router.post('/register', async (req, res) => {
  const { name, email, password, bio, zip_code } = req.body;

  try {
    await pool.query(
      `INSERT INTO users (name, email, password_hash, bio, zip_code)
       VALUES ($1, $2, $3, $4, $5)`,
      [name, email, password, bio, zip_code]
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

    if (user.password_hash !== password) {
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
    const result = await pool.query(
      'SELECT * FROM users WHERE user_id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).send('User not found');
    }

    res.render('profile', { user: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.send('Error retrieving profile');
  }
});

module.exports = router;