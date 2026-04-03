const express = require('express');
const router = express.Router();
const pool = require('../config/db');

// GET /requests
router.get('/', async (req, res) => {
  if (!req.currentUserId) {
    return res.render('message', {
      title: 'Login Required',
      message: 'You must be logged in to send a request.',
      actionText: 'Login',
      actionHref: '/users/login'
    });
  }

  try {
    const incomingResult = await pool.query(
      `
      SELECT requests.*, listings.title AS listing_title, users.name AS requester_name
      FROM requests
      JOIN listings ON requests.listing_id = listings.listing_id
      JOIN users ON requests.requester_id = users.user_id
      WHERE requests.owner_id = $1
      ORDER BY requests.created_at DESC
      `,
      [req.currentUserId]
    );

    const outgoingResult = await pool.query(
      `
      SELECT requests.*, listings.title AS listing_title, users.name AS owner_name
      FROM requests
      JOIN listings ON requests.listing_id = listings.listing_id
      JOIN users ON requests.owner_id = users.user_id
      WHERE requests.requester_id = $1
      ORDER BY requests.created_at DESC
      `,
      [req.currentUserId]
    );

    res.render('requests', {
      incomingRequests: incomingResult.rows,
      outgoingRequests: outgoingResult.rows
    });
  } catch (err) {
    console.error(err);
    res.send('Error loading requests');
  }
});

// POST /requests/:id/accept
router.post('/:id/accept', async (req, res) => {
  if (!req.currentUserId) {
    return res.render('message', {
      title: 'Login Required',
      message: 'You must be logged in to manage requests.',
      actionText: 'Login',
      actionHref: '/users/login'
    });
  }

  const { id } = req.params;

  try {
    await pool.query(
      `
      UPDATE requests
      SET status = 'accepted', updated_at = NOW()
      WHERE request_id = $1 AND owner_id = $2
      `,
      [id, req.currentUserId]
    );

    res.redirect('/requests');
  } catch (err) {
    console.error(err);
    res.send('Error accepting request');
  }
});

// POST /requests/:id/decline
router.post('/:id/decline', async (req, res) => {
  if (!req.currentUserId) {
    return res.render('message', {
      title: 'Login Required',
      message: 'You must be logged in to manage requests.',
      actionText: 'Login',
      actionHref: '/users/login'
    });
  }

  const { id } = req.params;

  try {
    await pool.query(
      `
      UPDATE requests
      SET status = 'declined', updated_at = NOW()
      WHERE request_id = $1 AND owner_id = $2
      `,
      [id, req.currentUserId]
    );

    res.redirect('/requests');
  } catch (err) {
    console.error(err);
    res.send('Error declining request');
  }
});

module.exports = router;