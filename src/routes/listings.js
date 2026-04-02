const express = require('express');
const router = express.Router();
const pool = require('../config/db');

router.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM listings');
    res.render('listings', { listings: result.rows });
  } catch (err) {
    console.error(err);
    res.send('Database error');
  }
});

module.exports = router;