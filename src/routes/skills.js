// routes/skills.js - Handles all routes related to user skills, including adding new skills and deleting existing skills.

const express = require('express');
const router = express.Router();
const pool = require('../config/db');

// GET /skills/new
// Renders the form for adding a new skill. Only accessible to logged-in users.
router.get('/new', (req, res) => {
  if (!req.currentUserId) {
    return res.render('message', {
      title: 'Login Required',
      message: 'You must be logged in to add a skill.',
      actionText: 'Login',
      actionHref: '/users/login'
    });
  }

  res.render('create-skill', {
    currentUserId: req.currentUserId
  });
});

// POST /skills
// Handles the form submission for adding a new skill. It first checks if the user is logged in, then it takes the skill information from the form and inserts it into the database. If the insertion is successful, it redirects back to the user's profile page. If there's an error during the database operation, it catches the error and renders a message page with an error message.
router.post('/', async (req, res) => {
  if (!req.currentUserId) {
    return res.render('message', {
      title: 'Login Required',
      message: 'You must be logged in to add a skill.',
      actionText: 'Login',
      actionHref: '/users/login'
    });
  }

  const { name, description, category } = req.body;

  try {
    await pool.query(
      `INSERT INTO skills (user_id, name, description, category)
       VALUES ($1, $2, $3, $4)`,
      [req.currentUserId, name, description, category]
    );

    res.redirect(`/users/${req.currentUserId}`);
  } catch (err) {
    console.error(err);
    res.render('message', {
      title: 'Error Creating Skill',
      message: 'An error occurred while creating the skill.',
      actionText: 'Try Again',
      actionHref: '/skills/new'
    });
  }
});

// POST /skills/:id/delete
// Handles the deletion of a skill. It first checks if the user is logged in, then it verifies that the skill exists and belongs to the current user. If the checks pass, it deletes the skill from the database. If there's an error during the database operation, it catches the error and renders a message page with an error message.
router.post('/:id/delete', async (req, res) => {
  if (!req.currentUserId) {
    return res.render('message', {
      title: 'Login Required',
      message: 'You must be logged in to delete a skill.',
      actionText: 'Login',
      actionHref: '/users/login'
    });
  }

  const { id } = req.params;

  try {
    const result = await pool.query(
      'SELECT * FROM skills WHERE skill_id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return res.render('message', {
        title: 'Skill Not Found',
        message: 'The skill you are trying to delete does not exist.',
        actionText: 'Back to Profile',
        actionHref: `/users/${req.currentUserId}`
      });
    }

    const skill = result.rows[0];

    if (skill.user_id !== req.currentUserId) {
      return res.render('message', {
        title: 'Access Denied',
        message: 'You are not authorized to delete this skill.',
        actionText: 'Back to Profile',
        actionHref: `/users/${req.currentUserId}`
      });
    }

    await pool.query(
      'DELETE FROM skills WHERE skill_id = $1',
      [id]
    );

    res.redirect(`/users/${req.currentUserId}`);
  } catch (err) {
    console.error(err);
    res.render('message', {
      title: 'Error Deleting Skill',
      message: 'An error occurred while deleting the skill.',
      actionText: 'Back to Profile',
      actionHref: `/users/${req.currentUserId}`
    });
  }
});

module.exports = router;