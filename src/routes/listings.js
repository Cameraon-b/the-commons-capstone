// This file defines the Express router for handling listing-related routes, including viewing all listings, creating a new listing, viewing a specific listing, and sending a request for a listing. It interacts with the PostgreSQL database to manage listing data and uses EJS templates to render the appropriate views for each route. The router includes error handling for common issues such as unauthorized access and database errors.


const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const zipcodes = require('zipcodes');


router.get('/', async (req, res) => {
  try {
    const { zip_code, radius, category, type } = req.query;

    let conditions = [];
    let values = [];
    let valueIndex = 1;

    if (zip_code && radius) {
      const nearbyZips = zipcodes.radius(zip_code, parseInt(radius));

      conditions.push(`listings.zip_code = ANY($${valueIndex})`);
      values.push(nearbyZips);
      valueIndex++;
    }

    if (category) {
      conditions.push(`LOWER(listings.category) LIKE LOWER($${valueIndex})`);
      values.push(`%${category}%`);
      valueIndex++;
    }

    if (type) {
      conditions.push(`LOWER(listings.type) = LOWER($${valueIndex})`);
      values.push(type);
      valueIndex++;
    }

    let query = `
      SELECT listings.*, users.name
      FROM listings
      JOIN users ON listings.user_id = users.user_id
    `;

    if (conditions.length > 0) {
      query += ` WHERE ` + conditions.join(' AND ');
    }

    query += ` ORDER BY listings.created_at DESC`;

    const result = await pool.query(query, values);
    let listings = result.rows;

    if (zip_code) {
      listings = listings.map(listing => {
        const distance = Math.round(zipcodes.distance(zip_code, listing.zip_code));

        return {
          ...listing,
          distance
        };
      });
    }

    res.render('listings', {
      listings,
      currentZip: zip_code || '',
      currentRadius: radius || '',
      currentCategory: category || '',
      currentType: type || ''

    });

  } catch (err) {
    console.error(err);
    res.send('Error loading listings');
  }
});

// GET /listings/create
router.get('/create', (req, res) => {
  if (!req.currentUserId) {
    return res.render('message', {
      title: 'Login Required',
      message: 'You must be logged in to create a listing.',
      actionText: 'Login',
      actionHref: '/users/login'
    });
  }

  res.render('create-listing');
});

// GET /listings/:id
router.get('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(`
      SELECT listings.*, users.name
      FROM listings
      JOIN users ON listings.user_id = users.user_id
      WHERE listings.listing_id = $1
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).send('Listing not found');
    }

    const listing = result.rows[0];
    let distance = null;

    if (req.currentUserId) {
      const userResult = await pool.query(
        'SELECT zip_code FROM users WHERE user_id = $1',
        [req.currentUserId]
      );

      if (userResult.rows.length > 0) {
        const userZip = userResult.rows[0].zip_code;

        if (userZip && listing.zip_code) {
          distance = Math.round(zipcodes.distance(userZip, listing.zip_code));
        }
      }
    }

    res.render('listing-detail', {
      listing,
      distance
    });
  } catch (err) {
    console.error(err);
    res.send('Error retrieving listing');
  }
});

// POST /listings/:id/request
router.post('/:id/request', async (req, res) => {
  if (!req.currentUserId) {
    return res.send(`
      <h2>You must be logged in to send a request.</h2>
      <a href="/users/login">Login</a>
    `);
  }

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

    // prevent requesting your own listing
    if (listing.user_id === req.currentUserId) {
      return res.render('message', {
        title: 'Action Not Allowed',
        message: 'You cannot request your own listing.',
        actionText: 'Back to Listings',
        actionHref: '/listings'
      });
    }

    if (listing.status !== 'available') {
      return res.render('message', {
        title: 'Listing Unavailable',
        message: 'This listing is currently not available for new requests.',
        actionText: 'Back to Listings',
        actionHref: '/listings'
      });
    }

    await pool.query(
      `INSERT INTO requests
      (listing_id, requester_id, owner_id, request_message, contact_method, contact_value, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        listing.listing_id,
        req.currentUserId,
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
  if (!req.currentUserId) {
    return res.render('message', {
      title: 'Login Required',
      message: 'You must be logged in to create a listing.',
      actionText: 'Login',
      actionHref: '/users/login'
    });
  }

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
        req.currentUserId,
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