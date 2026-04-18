// Middleware to attach the count of unread notifications to res.locals for use in templates

const pool = require('../config/db');

async function attachNotificationCount(req, res, next) {
  if (!req.currentUserId) {
    res.locals.notificationCount = 0;
    return next();
  }

  try {
    const result = await pool.query(
      `SELECT COUNT(*) 
       FROM notifications
       WHERE user_id = $1 AND is_read = FALSE`,
      [req.currentUserId]
    );

    res.locals.notificationCount = parseInt(result.rows[0].count, 10);
  } catch (err) {
    console.error('Error loading notification count:', err);
    res.locals.notificationCount = 0;
  }

  next();
}

module.exports = attachNotificationCount;