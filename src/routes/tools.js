const express = require('express');
const router = express.Router();
const pool = require('../config/db');

// GET /tools/new
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
    res.send('Error creating tool');
  }
});

// POST /tools/:id/delete
router.post('/:id/delete', async (req, res) => {
  if (!req.currentUserId) {
    return res.redirect('/users/login');
  }

  const { id } = req.params;

  try {
    const result = await pool.query(
      'SELECT * FROM tools WHERE tool_id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).send('Tool not found');
    }

    const tool = result.rows[0];

    if (tool.user_id !== req.currentUserId) {
      return res.status(403).send('Not authorized to delete this tool');
    }

    await pool.query(
      'DELETE FROM tools WHERE tool_id = $1',
      [id]
    );

    res.redirect(`/users/${req.currentUserId}`);
  } catch (err) {
    console.error(err);
    res.send('Error deleting tool');
  }
});

module.exports = router;