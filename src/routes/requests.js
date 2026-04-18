// routes/requests.js - Handles all routes related to requests, including viewing incoming/outgoing requests, accepting/declining requests, and marking requests as completed.

const express = require('express');
const router = express.Router();
const pool = require('../config/db');

// GET /requests
router.get('/', async (req, res) => {
  if (!req.currentUserId) {
    return res.render('message', {
      title: 'Login Required',
      message: 'You must be logged in to view requests.',
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

    const incomingRequests = incomingResult.rows.filter(
      request => request.status === 'pending' || request.status === 'accepted'
    );

    const outgoingRequests = outgoingResult.rows.filter(
      request => request.status === 'pending' || request.status === 'accepted'
    );

    const historyRequests = [
      ...incomingResult.rows.filter(
        request => request.status === 'declined' || request.status === 'completed'
      ),
      ...outgoingResult.rows.filter(
        request => request.status === 'declined' || request.status === 'completed'
      )
    ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    res.render('requests', {
      incomingRequests,
      outgoingRequests,
      historyRequests
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
    // Get request first
    const requestResult = await pool.query(
      'SELECT * FROM requests WHERE request_id = $1 AND owner_id = $2',
      [id, req.currentUserId]
    );

    if (requestResult.rows.length === 0) {
      return res.send('Request not found');
    }

    const request = requestResult.rows[0];

    // Get listing for title
    const listingResult = await pool.query(
      'SELECT * FROM listings WHERE listing_id = $1',
      [request.listing_id]
    );

    if (listingResult.rows.length === 0) {
      return res.send('Listing not found');
    }

    const listing = listingResult.rows[0];

    // Update request status
    await pool.query(
      `
      UPDATE requests
      SET status = 'accepted', updated_at = NOW()
      WHERE request_id = $1 AND owner_id = $2
      `,
      [id, req.currentUserId]
    );

    // Update listing status
    await pool.query(
      `
      UPDATE listings
      SET status = 'in_use', updated_at = NOW()
      WHERE listing_id = $1
      `,
      [request.listing_id]
    );

    // Notify requester
    await pool.query(
      `
      INSERT INTO notifications (user_id, request_id, type, message, link)
      VALUES ($1, $2, $3, $4, $5)
      `,
      [
        request.requester_id,
        request.request_id,
        'accepted_request',
        `Your request for ${listing.title} was accepted.`,
        '/requests'
      ]
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
    // Get request first
    const requestResult = await pool.query(
      'SELECT * FROM requests WHERE request_id = $1 AND owner_id = $2',
      [id, req.currentUserId]
    );

    if (requestResult.rows.length === 0) {
      return res.send('Request not found');
    }

    const request = requestResult.rows[0];

    // Get listing for title
    const listingResult = await pool.query(
      'SELECT * FROM listings WHERE listing_id = $1',
      [request.listing_id]
    );

    if (listingResult.rows.length === 0) {
      return res.send('Listing not found');
    }

    const listing = listingResult.rows[0];

    // Update request status
    await pool.query(
      `
      UPDATE requests
      SET status = 'declined', updated_at = NOW()
      WHERE request_id = $1 AND owner_id = $2
      `,
      [id, req.currentUserId]
    );

    // Notify requester
    await pool.query(
      `
      INSERT INTO notifications (user_id, request_id, type, message, link)
      VALUES ($1, $2, $3, $4, $5)
      `,
      [
        request.requester_id,
        request.request_id,
        'declined_request',
        `Your request for ${listing.title} was declined.`,
        '/requests'
      ]
    );

    res.redirect('/requests');
  } catch (err) {
    console.error(err);
    res.send('Error declining request');
  }
});

// POST /requests/:id/complete
router.post('/:id/complete', async (req, res) => {
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
    // Get request first
    const requestResult = await pool.query(
      'SELECT * FROM requests WHERE request_id = $1 AND owner_id = $2',
      [id, req.currentUserId]
    );

    if (requestResult.rows.length === 0) {
      return res.send('Request not found');
    }

    const request = requestResult.rows[0];

    // Get listing for title
    const listingResult = await pool.query(
      'SELECT * FROM listings WHERE listing_id = $1',
      [request.listing_id]
    );

    if (listingResult.rows.length === 0) {
      return res.send('Listing not found');
    }

    const listing = listingResult.rows[0];

    // Update request status
    await pool.query(
      `
      UPDATE requests
      SET status = 'completed', updated_at = NOW()
      WHERE request_id = $1 AND owner_id = $2
      `,
      [id, req.currentUserId]
    );

    // Update listing status
    await pool.query(
      `
      UPDATE listings
      SET status = 'available', updated_at = NOW()
      WHERE listing_id = $1
      `,
      [request.listing_id]
    );

    // Notify requester
    await pool.query(
      `
      INSERT INTO notifications (user_id, request_id, type, message, link)
      VALUES ($1, $2, $3, $4, $5)
      `,
      [
        request.requester_id,
        request.request_id,
        'completed_request',
        `Your exchange for ${listing.title} was marked complete.`,
        '/requests'
      ]
    );

    res.redirect('/requests');
  } catch (err) {
    console.error(err);
    res.send('Error completing request');
  }
});

module.exports = router;