const express = require('express');
const router = express.Router();
const pool = require('../config/db');

// GET /reviews/:requestId/new
router.get('/:requestId/new', async (req, res) => {
  if (!req.currentUserId) {
    return res.render('message', {
      title: 'Login Required',
      message: 'You must be logged in to leave a review.',
      actionText: 'Login',
      actionHref: '/users/login'
    });
  }

  const { requestId } = req.params;

  try {
    const requestResult = await pool.query(
      'SELECT * FROM requests WHERE request_id = $1',
      [requestId]
    );

    if (requestResult.rows.length === 0) {
      return res.render('message', {
        title: 'Request Not Found',
        message: 'That request could not be found.',
        actionText: 'Back to Requests',
        actionHref: '/requests'
      });
    }

    const request = requestResult.rows[0];

    if (request.status !== 'completed') {
      return res.render('message', {
        title: 'Review Not Allowed',
        message: 'You can only review completed exchanges.',
        actionText: 'Back to Requests',
        actionHref: '/requests'
      });
    }

    if (
      req.currentUserId !== request.requester_id &&
      req.currentUserId !== request.owner_id
    ) {
      return res.render('message', {
        title: 'Access Denied',
        message: 'You are not part of this exchange.',
        actionText: 'Back to Requests',
        actionHref: '/requests'
      });
    }

    const existingReview = await pool.query(
      'SELECT * FROM reviews WHERE request_id = $1 AND reviewer_id = $2',
      [requestId, req.currentUserId]
    );

    if (existingReview.rows.length > 0) {
      return res.render('message', {
        title: 'Review Already Submitted',
        message: 'You have already reviewed this exchange.',
        actionText: 'Back to Requests',
        actionHref: '/requests'
      });
    }

    const reviewedUserId =
      req.currentUserId === request.owner_id
        ? request.requester_id
        : request.owner_id;

    const userResult = await pool.query(
      'SELECT * FROM users WHERE user_id = $1',
      [reviewedUserId]
    );

    const reviewedUser = userResult.rows[0];

    res.render('leave-review', {
      request,
      reviewedUser
    });
  } catch (err) {
    console.error(err);
    res.send('Error loading review form');
  }
});

// POST /reviews/:requestId
router.post('/:requestId', async (req, res) => {
  if (!req.currentUserId) {
    return res.render('message', {
      title: 'Login Required',
      message: 'You must be logged in to leave a review.',
      actionText: 'Login',
      actionHref: '/users/login'
    });
  }

  const { requestId } = req.params;
  const { rating, comment } = req.body;

  try {
    const requestResult = await pool.query(
      'SELECT * FROM requests WHERE request_id = $1',
      [requestId]
    );

    if (requestResult.rows.length === 0) {
      return res.render('message', {
        title: 'Request Not Found',
        message: 'That request could not be found.',
        actionText: 'Back to Requests',
        actionHref: '/requests'
      });
    }

    const request = requestResult.rows[0];

    if (request.status !== 'completed') {
      return res.render('message', {
        title: 'Review Not Allowed',
        message: 'You can only review completed exchanges.',
        actionText: 'Back to Requests',
        actionHref: '/requests'
      });
    }

    if (
      req.currentUserId !== request.requester_id &&
      req.currentUserId !== request.owner_id
    ) {
      return res.render('message', {
        title: 'Access Denied',
        message: 'You are not part of this exchange.',
        actionText: 'Back to Requests',
        actionHref: '/requests'
      });
    }

    const existingReview = await pool.query(
      'SELECT * FROM reviews WHERE request_id = $1 AND reviewer_id = $2',
      [requestId, req.currentUserId]
    );

    if (existingReview.rows.length > 0) {
      return res.render('message', {
        title: 'Review Already Submitted',
        message: 'You have already reviewed this exchange.',
        actionText: 'Back to Requests',
        actionHref: '/requests'
      });
    }

    const reviewedUserId =
      req.currentUserId === request.owner_id
        ? request.requester_id
        : request.owner_id;

    await pool.query(
      `
      INSERT INTO reviews (request_id, reviewer_id, reviewed_user_id, rating, comment)
      VALUES ($1, $2, $3, $4, $5)
      `,
      [requestId, req.currentUserId, reviewedUserId, rating, comment]
    );

    res.redirect('/requests');
  } catch (err) {
    console.error(err);
    res.send('Error submitting review');
  }
});

module.exports = router;