// routes/requests.js - Handles all routes related to requests, including viewing incoming/outgoing requests, accepting/declining requests, and marking requests as completed.

const express = require('express');
const router = express.Router();
const pool = require('../config/db');

// GET /requests
// Renders the requests page for the logged-in user, showing incoming requests (requests from other users for the current user's listings), outgoing requests (requests made by the current user for other users' listings), and a history of past requests (both incoming and outgoing) that have been completed or declined. Only accessible to logged-in users.
router.get('/', async (req, res) => {
  if (!req.currentUserId) {
    return res.render('message', {
      title: 'Login Required',
      message: 'You must be logged in to view requests.',
      actionText: 'Login',
      actionHref: '/users/login'
    });
  }

  //loads all incoming and outgoing requests for the current user, including the relevant listing and user information to display in the requests page. It also separates the requests into different categories (pending/accepted vs. declined/completed) so they can be displayed in different sections on the page.
  try {
    const incomingResult = await pool.query(
      `
      SELECT 
        requests.*, 
        listings.title AS listing_title, 
        users.name AS requester_name,
        reviews.review_id AS user_review_id
      FROM requests
      JOIN listings ON requests.listing_id = listings.listing_id
      JOIN users ON requests.requester_id = users.user_id
      LEFT JOIN reviews 
        ON reviews.request_id = requests.request_id
        AND reviews.reviewer_id = $1
      WHERE requests.owner_id = $1
      ORDER BY requests.created_at DESC
      `,
      [req.currentUserId]
    );

    const outgoingResult = await pool.query(
      `
      SELECT requests.*, listings.title AS listing_title, users.name AS owner_name, reviews.review_id AS user_review_id
      FROM requests
      JOIN listings ON requests.listing_id = listings.listing_id
      JOIN users ON requests.owner_id = users.user_id
      LEFT JOIN reviews 
        ON reviews.request_id = requests.request_id
        AND reviews.reviewer_id = $1
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

    // renders the requests page with the incoming, outgoing, and history requests passed in as variables. The template can then display these requests in separate sections and provide options to manage them (accept/decline for incoming requests, cancel for outgoing requests, etc.).
    res.render('requests', {
      incomingRequests,
      outgoingRequests,
      historyRequests
    });

    // handle any errors that occur while loading requests and show a user-friendly error message instead of crashing the page
  } catch (err) {
    console.error(err);
    res.render('message', {
      title: 'Error Loading Requests',
      message: 'An error occurred while loading requests.',
      actionText: 'Back to Home',
      actionHref: '/'
    });
  }
});

// POST /requests/:id/accept
// Allows the owner of a listing to accept a request from another user. Only the owner of the listing can accept a request for that listing. This route updates the status of the request to "accepted", updates the status of the listing to "in_use", and creates a notification for the requester to inform them that their request was accepted.
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

  // We need to validate that the request exists and belongs to the current user before we can accept it. We also need to load the relevant listing information to include in the notification message for the requester. This ensures that users can only manage requests for their own listings and that notifications contain useful information about the accepted request.
  try {
    // Get request first
    const requestResult = await pool.query(
      'SELECT * FROM requests WHERE request_id = $1 AND owner_id = $2',
      [id, req.currentUserId]
    );

    // If the request doesn't exist or doesn't belong to the user, show an error message instead of just crashing or doing nothing
    if (requestResult.rows.length === 0) {
      return res.render('message', {
        title: 'Request Not Found',
        message: 'The request you are trying to manage does not exist.',
        actionText: 'Back to Requests',
        actionHref: '/requests'
      });
    }

    const request = requestResult.rows[0];

    // Get listing for title
    const listingResult = await pool.query(
      'SELECT * FROM listings WHERE listing_id = $1',
      [request.listing_id]
    );

    // If the listing doesn't exist (which would be strange since the request exists, but we should still handle this case), show an error message instead of crashing
    if (listingResult.rows.length === 0) {
      return res.render('message', {
        title: 'Listing Not Found',
        message: 'The listing for this request could not be found.',
        actionText: 'Back to Requests',
        actionHref: '/requests'
      });
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
    // handle any errors that occur while accepting the request and show a user-friendly error message instead of crashing the page
  } catch (err) {
    console.error(err);
    res.render('message', {
      title: 'Error Accepting Request',
      message: 'An error occurred while accepting the request.',
      actionText: 'Back to Requests',
      actionHref: '/requests'
    });
  }
});

// POST /requests/:id/decline
// Allows the owner of a listing to decline a request from another user. Only the owner of the listing can decline a request for that listing. This route updates the status of the request to "declined" and creates a notification for the requester to inform them that their request was declined.
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

  // We need to validate that the request exists and belongs to the current user before we can decline it. We also need to load the relevant listing information to include in the notification message for the requester. This ensures that users can only manage requests for their own listings and that notifications contain useful information about the declined request.
  try {
    // Get request first
    const requestResult = await pool.query(
      'SELECT * FROM requests WHERE request_id = $1 AND owner_id = $2',
      [id, req.currentUserId]
    );

    // If the request doesn't exist or doesn't belong to the user, show an error message instead of just crashing or doing nothing
    if (requestResult.rows.length === 0) {
      return res.render('message', {
        title: 'Request Not Found',
        message: 'The request you are trying to manage does not exist.',
        actionText: 'Back to Requests',
        actionHref: '/requests'
      });
    }

    const request = requestResult.rows[0];

    // Get listing for title
    const listingResult = await pool.query(
      'SELECT * FROM listings WHERE listing_id = $1',
      [request.listing_id]
    );

    // If the listing doesn't exist (which would be strange since the request exists, but we should still handle this case), show an error message instead of crashing
    if (listingResult.rows.length === 0) {
      return res.render('message', {
        title: 'Listing Not Found',
        message: 'The listing for this request could not be found.',
        actionText: 'Back to Requests',
        actionHref: '/requests'
      });
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

    // handle any errors that occur while declining the request and show a user-friendly error message instead of crashing the page
    res.redirect('/requests');
  } catch (err) {
    console.error(err);
    res.render('message', {
      title: 'Error Declining Request',
      message: 'An error occurred while declining the request.',
      actionText: 'Back to Requests',
      actionHref: '/requests'
    });
  }
});

// POST /requests/:id/complete
// Allows the owner of a listing to mark a request as completed once the exchange has taken place. Only the owner of the listing can mark a request for that listing as completed. This route updates the status of the request to "completed", updates the status of the listing back to "available", and creates a notification for the requester to inform them that their request was marked as completed.
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

    // If the request doesn't exist or doesn't belong to the user, show an error message instead of just crashing or doing nothing
    if (requestResult.rows.length === 0) {
      return res.render('message', {
        title: 'Request Not Found',
        message: 'The request you are trying to manage does not exist.',
        actionText: 'Back to Requests',
        actionHref: '/requests'
      });
    }

    const request = requestResult.rows[0];

    // Get listing for title
    const listingResult = await pool.query(
      'SELECT * FROM listings WHERE listing_id = $1',
      [request.listing_id]
    );

    // If the listing doesn't exist (which would be strange since the request exists, but we should still handle this case), show an error message instead of crashing
    if (listingResult.rows.length === 0) {
      return res.render('message', {
        title: 'Listing Not Found',
        message: 'The listing for this request could not be found.',
        actionText: 'Back to Requests',
        actionHref: '/requests'
      });
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
    // handle any errors that occur while completing the request and show a user-friendly error message instead of crashing the page
  } catch (err) {
    console.error(err);
    res.render('message', {
      title: 'Error Completing Request',
      message: 'An error occurred while completing the request.',
      actionText: 'Back to Requests',
      actionHref: '/requests'
    });
  }
});

module.exports = router;