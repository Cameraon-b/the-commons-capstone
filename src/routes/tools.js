// routes/tools.js - Handles all routes related to user tools, including adding new tools and deleting existing tools.

const express = require('express');
const router = express.Router();
const pool = require('../config/db');

// GET /tools/new
// Renders the form for adding a new tool. Only accessible to logged-in users.
router.get('/new', (req, res) => {
  if (!req.currentUserId) {
    return res.render('message', {
      title: 'Login Required',
      message: 'You must be logged in to add a tool.',
      actionText: 'Login',
      actionHref: '/users/login'
    });
  }

  res.render('create-tool', {
    currentUserId: req.currentUserId
  });
});

// POST /tools
// Handles the form submission for adding a new tool. It first checks if the user is logged in, then it takes the tool information from the form and inserts it into the database. If the insertion is successful, it redirects back to the user's profile page. If there's an error during the database operation, it catches the error and renders a message page with an error message.
router.post('/', async (req, res) => {
  if (!req.currentUserId) {
    return res.render('message', {
      title: 'Login Required',
      message: 'You must be logged in to add a tool.',
      actionText: 'Login',
      actionHref: '/users/login'
    });
  }

  const { name, description, category } = req.body;

  try {
    await pool.query(
      `INSERT INTO tools (user_id, name, description, category)
       VALUES ($1, $2, $3, $4)`,
      [req.currentUserId, name, description, category]
    );

    res.redirect(`/users/${req.currentUserId}`);
  } catch (err) {
    console.error(err);
    res.render('message', {
      title: 'Error Creating Tool',
      message: 'An error occurred while creating the tool.',
      actionText: 'Try Again',
      actionHref: '/tools/new'
    });
  }
});

// POST /tools/:id/delete
// Handles the deletion of a tool. It first checks if the user is logged in, then it verifies that the tool exists and belongs to the current user. If the checks pass, it deletes the tool from the database. If there's an error during the database operation, it catches the error and renders a message page with an error message.
router.post('/:id/delete', async (req, res) => {
  if (!req.currentUserId) {
    return res.render('message', {
      title: 'Login Required',
      message: 'You must be logged in to delete a tool.',
      actionText: 'Login',
      actionHref: '/users/login'
    });
  }

  const { id } = req.params;

  try {
    const result = await pool.query(
      'SELECT * FROM tools WHERE tool_id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return res.render('message', {
        title: 'Tool Not Found',
        message: 'The tool you are trying to delete does not exist.',
        actionText: 'Back to Profile',
        actionHref: `/users/${req.currentUserId}`
      });
    }

    const tool = result.rows[0];

    if (tool.user_id !== req.currentUserId) {
      return res.render('message', {
        title: 'Access Denied',
        message: 'You are not authorized to delete this tool.',
        actionText: 'Back to Profile',
        actionHref: `/users/${req.currentUserId}`
      });
    }

    await pool.query(
      'DELETE FROM tools WHERE tool_id = $1',
      [id]
    );

    res.redirect(`/users/${req.currentUserId}`);
  } catch (err) {
    console.error(err);
    res.render('message', {
      title: 'Error Deleting Tool',
      message: 'An error occurred while deleting the tool.',
      actionText: 'Back to Profile',
      actionHref: `/users/${req.currentUserId}`
    });
  }
});

module.exports = router;