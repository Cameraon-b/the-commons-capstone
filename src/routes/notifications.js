// routes/notifications.js - Handles all routes related to user notifications, including viewing, marking as read, and opening notifications.

const express = require('express');
const router = express.Router();
const pool = require('../config/db');

// GET /notifications
// Renders the notifications page for the logged-in user, showing both unread and read notifications. Only accessible to logged-in users.
router.get('/', async (req, res) => {
  if (!req.currentUserId) {
    return res.render('message', {
      title: 'Login Required',
      message: 'You must be logged in to view notifications.',
      actionText: 'Login',
      actionHref: '/users/login'
    });
  }

  // Loads all notifications for the current user, separating them into unread and read notifications to display them in different sections on the notifications page.
  try {
    const result = await pool.query(
      `SELECT *
       FROM notifications
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [req.currentUserId]
    );

    const unreadNotifications = result.rows.filter(n => !n.is_read);
    const readNotifications = result.rows.filter(n => n.is_read);

    // renders the notifications page with the unread and read notifications passed in as variables. The template can then display these notifications in separate sections and provide options to mark them as read or open them.
    res.render('notifications', {
      unreadNotifications,
      readNotifications,
      currentUserId: req.currentUserId
    });

    //handle any errors that occur while loading notifications and show a user-friendly error message instead of crashing the page
  } catch (err) {
    console.error(err);
    res.render('message', {
      title: 'Error Loading Notifications',
      message: 'An error occurred while loading notifications.',
      actionText: 'Back to Home',
      actionHref: '/'
    });
  }
});

// POST /notifications/:id/read
// Marks a specific notification as read. Only the owner of the notification can mark it as read.
router.post('/:id/read', async (req, res) => {
  if (!req.currentUserId) {
    return res.redirect('/users/login');
  }

  const { id } = req.params;

  //verifies that the notification belongs to the current user and then updates the is_read field to true for that notification. After marking it as read, it redirects back to the notifications page so the user can see the updated status of their notifications.
  try {
    await pool.query(
      `UPDATE notifications
       SET is_read = TRUE
       WHERE notification_id = $1 AND user_id = $2`,
      [id, req.currentUserId]
    );

    // handle any errors that occur while updating the notification and show a user-friendly error message instead of crashing the page
    res.redirect('/notifications');
  } catch (err) {
    console.error(err);
    res.render('message', {
      title: 'Error Updating Notification',
      message: 'An error occurred while updating the notification.',
      actionText: 'Back to Notifications',
      actionHref: '/notifications'
    });
  }
});

// POST /notifications/read-all
// Marks all notifications for the logged-in user as read. Only accessible to logged-in users.
router.post('/read-all', async (req, res) => {
  if (!req.currentUserId) {
    return res.redirect('/users/login');
  }

  try {
    await pool.query(
      `UPDATE notifications
       SET is_read = TRUE
       WHERE user_id = $1 AND is_read = false`,
      [req.currentUserId]
    );

    // handle any errors that occur while updating the notifications and show a user-friendly error message instead of crashing the page
    res.redirect('/notifications');
  } catch (err) {
    console.error(err);
    res.render('message', {
      title: 'Error Updating Notifications',
      message: 'An error occurred while updating notifications.',
      actionText: 'Back to Notifications',
      actionHref: '/notifications'
    });
  }
});

// GET /notifications/:id/open
// Marks the notification as read and redirects the user to the link stored in the notification. Only the owner of the notification can open it.
router.get('/:id/open', async (req, res) => {
  if (!req.currentUserId) {
    return res.redirect('/users/login');
  }

  const { id } = req.params;

  // First, we need to verify that the notification belongs to the current user and retrieve the link to redirect to. Then we mark it as read and redirect.
  try {
    const result = await pool.query(
      `SELECT * FROM notifications
       WHERE notification_id = $1 AND user_id = $2`,
      [id, req.currentUserId]
    );

    // If no notification is found or it doesn't belong to the user, redirect back to notifications page
    if (result.rows.length === 0) {
      return res.redirect('/notifications');
    }

    const notification = result.rows[0];

    // Mark the notification as read
    await pool.query(
      `UPDATE notifications
       SET is_read = TRUE
       WHERE notification_id = $1 AND user_id = $2`,
      [id, req.currentUserId]
    );

    // Redirect to the stored link
    res.redirect(notification.link || '/notifications');

    // handle any errors that occur while opening the notification and show a user-friendly error message instead of crashing the page
  } catch (err) {
    console.error(err);
    res.render('message', {
      title: 'Error Opening Notification',
      message: 'An error occurred while opening the notification.',
      actionText: 'Back to Notifications',
      actionHref: '/notifications'
    });
  }
});

module.exports = router;