// routes/notifications.js - Handles all routes related to user notifications, including viewing, marking as read, and opening notifications.

const express = require('express');
const router = express.Router();
const pool = require('../config/db');

// GET /notifications
router.get('/', async (req, res) => {
  if (!req.currentUserId) {
    return res.render('message', {
      title: 'Login Required',
      message: 'You must be logged in to view notifications.',
      actionText: 'Login',
      actionHref: '/users/login'
    });
  }

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

    res.render('notifications', {
      unreadNotifications,
      readNotifications,
      currentUserId: req.currentUserId
    });
  } catch (err) {
    console.error(err);
    res.send('Error loading notifications');
  }
});

// POST /notifications/:id/read
router.post('/:id/read', async (req, res) => {
  if (!req.currentUserId) {
    return res.redirect('/users/login');
  }

  const { id } = req.params;

  try {
    await pool.query(
      `UPDATE notifications
       SET is_read = TRUE
       WHERE notification_id = $1 AND user_id = $2`,
      [id, req.currentUserId]
    );

    res.redirect('/notifications');
  } catch (err) {
    console.error(err);
    res.send('Error updating notification');
  }
});

// POST /notifications/read-all
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

    res.redirect('/notifications');
  } catch (err) {
    console.error(err);
    res.send('Error updating notifications');
  }
});

// GET /notifications/:id/open
router.get('/:id/open', async (req, res) => {
  if (!req.currentUserId) {
    return res.redirect('/users/login');
  }

  const { id } = req.params;

  try {
    const result = await pool.query(
      `SELECT * FROM notifications
       WHERE notification_id = $1 AND user_id = $2`,
      [id, req.currentUserId]
    );

    if (result.rows.length === 0) {
      return res.redirect('/notifications');
    }

    const notification = result.rows[0];

    // mark as read
    await pool.query(
      `UPDATE notifications
       SET is_read = TRUE
       WHERE notification_id = $1 AND user_id = $2`,
      [id, req.currentUserId]
    );

    // redirect to stored link
    res.redirect(notification.link || '/notifications');

  } catch (err) {
    console.error(err);
    res.send('Error opening notification');
  }
});


module.exports = router;