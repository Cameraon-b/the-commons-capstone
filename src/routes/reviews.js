// routes/reviews.js - Handles all routes related to leaving reviews after completed exchanges.

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

  // This route renders the form for leaving a review for a specific request. It first checks if the user is logged in, then it verifies that the request exists and that the current user is either the requester or the owner of the request. It also checks that the request has been marked as completed and that the user hasn't already left a review for this request. If all checks pass, it loads the information about the user being reviewed (the other party in the exchange) and renders the leave-review template with that information.
  try {
    const requestResult = await pool.query(
      'SELECT * FROM requests WHERE request_id = $1',
      [requestId]
    );

    // If the request doesn't exist or doesn't belong to the user, show an error message instead of just crashing or doing nothing
    if (requestResult.rows.length === 0) {
      return res.render('message', {
        title: 'Request Not Found',
        message: 'That request could not be found.',
        actionText: 'Back to Requests',
        actionHref: '/requests'
      });
    }

    const request = requestResult.rows[0];

    // If the request isn't completed yet, the user shouldn't be able to leave a review, so show an error message instead of crashing or allowing them to submit a review for an incomplete exchange
    if (request.status !== 'completed') {
      return res.render('message', {
        title: 'Review Not Allowed',
        message: 'You can only review completed exchanges.',
        actionText: 'Back to Requests',
        actionHref: '/requests'
      });
    }

    // If the current user is not the requester or the owner of the request, they shouldn't be able to leave a review for this exchange, so show an error message instead of crashing or allowing them to submit a review for an exchange they're not part of
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

    // Check if the user has already left a review for this request
    const existingReview = await pool.query(
      'SELECT * FROM reviews WHERE request_id = $1 AND reviewer_id = $2',
      [requestId, req.currentUserId]
    );

    // If the user has already left a review for this request, they shouldn't be able to leave another one, so show an error message instead of crashing or allowing them to submit multiple reviews for the same exchange
    if (existingReview.rows.length > 0) {
      return res.render('message', {
        title: 'Review Already Submitted',
        message: 'You have already reviewed this exchange.',
        actionText: 'Back to Requests',
        actionHref: '/requests'
      });
    }

    // Determine the ID of the user being reviewed (the other party in the exchange) and load their information to display on the review form
    const reviewedUserId =
      req.currentUserId === request.owner_id
        ? request.requester_id
        : request.owner_id;

        // Load the information of the user being reviewed to display on the review form
    const userResult = await pool.query(
      'SELECT * FROM users WHERE user_id = $1',
      [reviewedUserId]
    );

    const reviewedUser = userResult.rows[0];

    res.render('leave-review', {
      request,
      reviewedUser
    });
    // handle any errors that occur while loading the review form and show a user-friendly error message instead of crashing the page
  } catch (err) {
    console.error(err);
    res.render('message', {
      title: 'Error Loading Review Form',
      message: 'An error occurred while loading the review form.',
      actionText: 'Back to Requests',
      actionHref: '/requests'
    });
  }
});

// POST /reviews/:requestId
// This route handles the submission of a review for a specific request. It performs the same checks as the GET route to ensure that the user is logged in, that the request exists and belongs to the user, that the request is completed, and that the user hasn't already left a review. If all checks pass, it inserts
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

    // If the request doesn't exist or doesn't belong to the user, show an error message instead of just crashing or doing nothing
    if (requestResult.rows.length === 0) {
      return res.render('message', {
        title: 'Request Not Found',
        message: 'That request could not be found.',
        actionText: 'Back to Requests',
        actionHref: '/requests'
      });
    }

    const request = requestResult.rows[0];

    // If the request isn't completed yet, the user shouldn't be able to leave a review, so show an error message instead of crashing or allowing them to submit a review for an incomplete exchange
    if (request.status !== 'completed') {
      return res.render('message', {
        title: 'Review Not Allowed',
        message: 'You can only review completed exchanges.',
        actionText: 'Back to Requests',
        actionHref: '/requests'
      });
    }

    // If the current user is not the requester or the owner of the request, they shouldn't be able to leave a review for this exchange, so show an error message instead of crashing or allowing them to submit a review for an exchange they're not part of
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

    // Check if the user has already left a review for this request
    const existingReview = await pool.query(
      'SELECT * FROM reviews WHERE request_id = $1 AND reviewer_id = $2',
      [requestId, req.currentUserId]
    );

    // If the user has already left a review for this request, they shouldn't be able to leave another one, so show an error message instead of crashing or allowing them to submit multiple reviews for the same exchange
    if (existingReview.rows.length > 0) {
      return res.render('message', {
        title: 'Review Already Submitted',
        message: 'You have already reviewed this exchange.',
        actionText: 'Back to Requests',
        actionHref: '/requests'
      });
    }

    // Determine the ID of the user being reviewed (the other party in the exchange) and insert the review into the database
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
    // handle any errors that occur while submitting the review and show a user-friendly error message instead of crashing the page
  } catch (err) {
    console.error(err);
    res.render('message', {
      title: 'Error Submitting Review',
      message: 'An error occurred while submitting the review.',
      actionText: 'Back to Requests',
      actionHref: '/requests'
    });
  }
});

module.exports = router;