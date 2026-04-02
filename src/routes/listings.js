const express = require('express');
const router = express.Router();
const pool = require('../config/db');

// GET /listings
router.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM listings ORDER BY created_at DESC');
    res.render('listings', { listings: result.rows });
  } catch (err) {
    console.error(err);
    res.send('Database error');
  }
});

// GET /listings/create
router.get('/create', (req, res) => {
  res.render('create-listing');
});

// GET /listings/:id
router.get('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      'SELECT * FROM listings WHERE listing_id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).send('Listing not found');
    }

    res.render('listing-detail', { listing: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.send('Error retrieving listing');
  }
});

// POST /listings/:id/request
router.post('/:id/request', async (req, res) => {
  const { id } = req.params;
  const { request_message, contact_method, contact_value } = req.body;

  try {
    const listingResult = await pool.query(
      'SELECT * FROM listings WHERE listing_id = $1',
      [id]
    );

    if (listingResult.rows.length === 0) {
      return res.status(404).send('Listing not found');
    }

    const listing = listingResult.rows[0];

    await pool.query(
      `INSERT INTO requests
      (listing_id, requester_id, owner_id, request_message, contact_method, contact_value, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        listing.listing_id,
        1, // placeholder requester_id for now
        listing.user_id,
        request_message,
        contact_method,
        contact_value,
        'pending'
      ]
    );

    res.redirect('/listings');
  } catch (err) {
    console.error(err);
    res.send('Error creating request');
  }
});

// POST /listings
router.post('/', async (req, res) => {
  const {
    title,
    description,
    type,
    category,
    availability,
    zip_code
  } = req.body;

  try {
    await pool.query(
      `INSERT INTO listings
      (user_id, type, title, description, category, availability, zip_code, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        1, // placeholder user_id for now
        type,
        title,
        description,
        category,
        availability,
        zip_code,
        'available'
      ]
    );

    res.redirect('/listings');
  } catch (err) {
    console.error(err);
    res.send('Error creating listing');
  }
});

module.exports = router;