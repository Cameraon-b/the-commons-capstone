// routes/listings.js - Handles all routes related to listings, including viewing, creating, editing, and requesting listings.

const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const zipcodes = require('zipcodes');
const { getUserReviews, getUserReviewSummary } = require('../helpers/reviews');

// GET /listings
router.get('/', async (req, res) => {
  try {
    const { zip_code, radius, category, type } = req.query;

    let conditions = [`LOWER(listings.status) != 'unavailable'`];
    let values = [];
    let valueIndex = 1;

    if (zip_code && radius) {
      const nearbyZips = zipcodes
        .radius(zip_code, parseInt(radius))
        .map(zip => String(zip));

      conditions.push(`listings.zip_code = ANY($${valueIndex})`);
      values.push(nearbyZips);
      valueIndex++;
    }

    if (category) {
      conditions.push(`LOWER(listings.category) LIKE LOWER($${valueIndex})`);
      values.push(`%${category}%`);
      valueIndex++;
    }

    if (type) {
      conditions.push(`LOWER(listings.type) = LOWER($${valueIndex})`);
      values.push(type);
      valueIndex++;
    }

    let query = `
      SELECT listings.*, users.name
      FROM listings
      JOIN users ON listings.user_id = users.user_id
    `;

    if (conditions.length > 0) {
      query += ` WHERE ` + conditions.join(' AND ');
    }

    query += ` ORDER BY listings.created_at DESC`;

    const result = await pool.query(query, values);
    let listings = result.rows;

    if (zip_code) {
      listings = listings.map(listing => {
        const rawDistance = zipcodes.distance(String(zip_code), String(listing.zip_code));

        return {
          ...listing,
          distance:
            rawDistance !== null && rawDistance !== undefined
              ? Number(rawDistance.toFixed(2))
              : null
        };
      });

      listings.sort((a, b) => {
        if (a.distance === null) return 1;
        if (b.distance === null) return -1;
        return a.distance - b.distance;
      });
    }

    res.render('listings', {
      listings,
      currentZip: zip_code || '',
      currentRadius: radius || '',
      currentCategory: category || '',
      currentType: type || ''
    });
  } catch (err) {
    console.error(err);
    res.send('Error loading listings');
  }
});

// GET /listings/create
router.get('/create', async (req, res) => {
  if (!req.currentUserId) {
    return res.render('message', {
      title: 'Login Required',
      message: 'You must be logged in to create a listing.',
      actionText: 'Login',
      actionHref: '/users/login'
    });
  }

  let { tool_id, skill_id, inventory_item } = req.query;

  if (inventory_item) {
    const [itemType, itemId] = inventory_item.split(':');

    if (itemType === 'tool') {
      tool_id = itemId;
    } else if (itemType === 'skill') {
      skill_id = itemId;
    }
  }

  try {
    let selectedItem = null;
    let selectedType = '';
    let formData = {
      title: '',
      description: '',
      category: '',
      zip_code: '',
      availability: ''
    };

    const userResult = await pool.query(
      'SELECT zip_code FROM users WHERE user_id = $1',
      [req.currentUserId]
    );

    const userZip = userResult.rows.length > 0 ? userResult.rows[0].zip_code : '';

    const toolsResult = await pool.query(
      'SELECT * FROM tools WHERE user_id = $1 ORDER BY created_at DESC',
      [req.currentUserId]
    );

    const skillsResult = await pool.query(
      'SELECT * FROM skills WHERE user_id = $1 ORDER BY created_at DESC',
      [req.currentUserId]
    );

    const tools = toolsResult.rows;
    const skills = skillsResult.rows;

    if (tool_id) {
      const toolResult = await pool.query(
        'SELECT * FROM tools WHERE tool_id = $1 AND user_id = $2',
        [tool_id, req.currentUserId]
      );

      if (toolResult.rows.length === 0) {
        return res.render('message', {
          title: 'Tool Not Found',
          message: 'That tool could not be found in your inventory.',
          actionText: 'Back to Profile',
          actionHref: `/users/${req.currentUserId}`
        });
      }

      selectedItem = toolResult.rows[0];
      selectedType = 'tool';

      formData = {
        title: selectedItem.name,
        description: selectedItem.description || '',
        category: selectedItem.category || '',
        zip_code: userZip || '',
        availability: ''
      };
    } else if (skill_id) {
      const skillResult = await pool.query(
        'SELECT * FROM skills WHERE skill_id = $1 AND user_id = $2',
        [skill_id, req.currentUserId]
      );

      if (skillResult.rows.length === 0) {
        return res.render('message', {
          title: 'Skill Not Found',
          message: 'That skill could not be found in your profile.',
          actionText: 'Back to Profile',
          actionHref: `/users/${req.currentUserId}`
        });
      }

      selectedItem = skillResult.rows[0];
      selectedType = 'skill';

      formData = {
        title: selectedItem.name,
        description: selectedItem.description || '',
        category: selectedItem.category || '',
        zip_code: userZip || '',
        availability: ''
      };
    }

    res.render('create-listing', {
      selectedType,
      selectedItem,
      formData,
      toolId: tool_id || '',
      skillId: skill_id || '',
      currentUserId: req.currentUserId,
      tools,
      skills
    });
  } catch (err) {
    console.error(err);
    res.send('Error loading listing form');
  }
});

// GET /listings/:id/edit
router.get('/:id/edit', async (req, res) => {
  if (!req.currentUserId) {
    return res.render('message', {
      title: 'Login Required',
      message: 'You must be logged in to edit a listing.',
      actionText: 'Login',
      actionHref: '/users/login'
    });
  }

  const { id } = req.params;

  try {
    const result = await pool.query(`
      SELECT * FROM listings WHERE listing_id = $1
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).send('Listing not found');
    }

    const listing = result.rows[0];

    if (listing.user_id !== req.currentUserId) {
      return res.status(403).send('You cannot edit this listing.');
    }

    res.render('edit-listing', {
      listing
    });
  } catch (err) {
    console.error(err);
    res.send('Error loading listing edit form');
  }
});

// POST /listings/:id/edit
router.post('/:id/edit', async (req, res) => {
  if (!req.currentUserId) {
    return res.render('message', {
      title: 'Login Required',
      message: 'You must be logged in to edit a listing.',
      actionText: 'Login',
      actionHref: '/users/login'
    });
  }

  const { id } = req.params;
  const { 
    title, 
    description, 
    category, 
    availability, 
    zip_code,
    status  
  } = req.body;

  try {
    const result = await pool.query(`
      SELECT * FROM listings WHERE listing_id = $1
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).send('Listing not found');
    }

    const listing = result.rows[0];

    if (listing.user_id !== req.currentUserId) {
      return res.status(403).send('You cannot edit this listing.');
    }

    await pool.query(`
      UPDATE listings
      SET title = $1, 
          description = $2, 
          category = $3, 
          availability = $4, 
          zip_code = $5,
          status = $6
      WHERE listing_id = $7
    `, [title, description, category, availability, zip_code, status, id]);

    res.redirect(`/users/${req.currentUserId}`);
  } catch (err) {
    console.error(err);
    res.send('Error updating listing');
  }
});

// POST /listings/:id/delete
router.post('/:id/delete', async (req, res) => {
  if (!req.currentUserId) {
    return res.render('message', {
      title: 'Login Required',
      message: 'You must be logged in to delete a listing.',
      actionText: 'Login',
      actionHref: '/users/login'
    });
  }

  const { id } = req.params;

  try {
    const result = await pool.query(`
      SELECT * FROM listings WHERE listing_id = $1
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).send('Listing not found');
    }

    const listing = result.rows[0];

    if (listing.user_id !== req.currentUserId) {
      return res.status(403).send('You cannot delete this listing.');
    }

    const requestCheck = await pool.query(`
      SELECT request_id FROM requests WHERE listing_id = $1 LIMIT 1
    `, [id]);

    if (requestCheck.rows.length > 0) {
      return res.render('message', {
        title: 'Cannot Delete Listing',
        message: 'This listing has request history and cannot be deleted.',
        actionText: 'Back to Profile',
        actionHref: `/users/${req.currentUserId}`
      });
    }

    await pool.query(`
      DELETE FROM listings WHERE listing_id = $1
    `, [id]);

    res.redirect(`/users/${req.currentUserId}`);
  } catch (err) {
    console.error(err);
    res.send('Error deleting listing');
  }
});


// GET /listings/:id
router.get('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(`
      SELECT listings.*, users.name
      FROM listings
      JOIN users ON listings.user_id = users.user_id
      WHERE listings.listing_id = $1
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).send('Listing not found');
    }

    const listing = result.rows[0];
    let distance = null;

    if (req.currentUserId) {
      const userResult = await pool.query(
        'SELECT zip_code FROM users WHERE user_id = $1',
        [req.currentUserId]
      );

      if (userResult.rows.length > 0) {
        const userZip = userResult.rows[0].zip_code;

        if (userZip && listing.zip_code) {
          distance = Math.round(zipcodes.distance(userZip, listing.zip_code));
        }
      }
    }

    const { averageRating, reviewCount } = await getUserReviewSummary(listing.user_id);
    const reviews = await getUserReviews(listing.user_id);

    res.render('listing-detail', {
      listing,
      distance,
      averageRating,
      reviewCount,
      reviews: reviews.slice(0, 3) // Show only the 3 most recent reviews on the listing page
    });

  } catch (err) {
    console.error(err);
    res.send('Error retrieving listing');
  }
});

// POST /listings/:id/request
router.post('/:id/request', async (req, res) => {
  if (!req.currentUserId) {
    return res.send(`
      <h2>You must be logged in to send a request.</h2>
      <a href="/users/login">Login</a>
    `);
  }

  const { id } = req.params;
  const { request_message, contact_method, contact_value } = req.body;

  try {
    const listingResult = await pool.query(
      'SELECT * FROM listings WHERE listing_id = $1',
      [id]
    );

    if (listingResult.rows.length === 0) {
      return res.status(404).send('Listing not found');
    }

    const listing = listingResult.rows[0];

    if (listing.user_id === req.currentUserId) {
      return res.render('message', {
        title: 'Action Not Allowed',
        message: 'You cannot request your own listing.',
        actionText: 'Back to Listings',
        actionHref: '/listings'
      });
    }

    if (listing.status !== 'available') {
      return res.render('message', {
        title: 'Listing Unavailable',
        message: 'This listing is currently not available for new requests.',
        actionText: 'Back to Listings',
        actionHref: '/listings'
      });
    }

    const requestInsert = await pool.query(
      `INSERT INTO requests
      (listing_id, requester_id, owner_id, request_message, contact_method, contact_value, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING request_id`,
      [
        listing.listing_id,
        req.currentUserId,
        listing.user_id,
        request_message,
        contact_method,
        contact_value,
        'pending'
      ]
    );

    const newRequestId = requestInsert.rows[0].request_id;

    await pool.query(
      `INSERT INTO notifications (user_id, request_id, type, message, link)
      VALUES ($1, $2, $3, $4, $5)`,
      [
        listing.user_id,
        newRequestId,
        'new_request',
        `You received a new request for ${listing.title}.`,
        '/requests'
      ]
    );

    res.redirect('/listings');
  } catch (err) {
    console.error(err);
    res.send('Error creating request');
  }
});

// POST /listings
router.post('/', async (req, res) => {
  if (!req.currentUserId) {
    return res.render('message', {
      title: 'Login Required',
      message: 'You must be logged in to create a listing.',
      actionText: 'Login',
      actionHref: '/users/login'
    });
  }

  const {
    tool_id,
    skill_id,
    title,
    description,
    type,
    category,
    availability,
    zip_code
  } = req.body;

  try {
    if (type === 'tool') {
      const toolResult = await pool.query(
        'SELECT * FROM tools WHERE tool_id = $1 AND user_id = $2',
        [tool_id, req.currentUserId]
      );

      if (toolResult.rows.length === 0) {
        return res.render('message', {
          title: 'Tool Not Found',
          message: 'You can only create listings from tools in your own inventory.',
          actionText: 'Back to Profile',
          actionHref: `/users/${req.currentUserId}`
        });
      }

      await pool.query(
        `INSERT INTO listings
        (user_id, tool_id, skill_id, type, title, description, category, availability, zip_code, status)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          req.currentUserId,
          tool_id,
          null,
          'tool',
          title,
          description,
          category,
          availability,
          zip_code,
          'available'
        ]
      );
    } else if (type === 'skill') {
      const skillResult = await pool.query(
        'SELECT * FROM skills WHERE skill_id = $1 AND user_id = $2',
        [skill_id, req.currentUserId]
      );

      if (skillResult.rows.length === 0) {
        return res.render('message', {
          title: 'Skill Not Found',
          message: 'You can only create listings from skills in your own profile.',
          actionText: 'Back to Profile',
          actionHref: `/users/${req.currentUserId}`
        });
      }

      await pool.query(
        `INSERT INTO listings
        (user_id, tool_id, skill_id, type, title, description, category, availability, zip_code, status)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          req.currentUserId,
          null,
          skill_id,
          'skill',
          title,
          description,
          category,
          availability,
          zip_code,
          'available'
        ]
      );
    } else {
      return res.render('message', {
        title: 'Invalid Listing Type',
        message: 'Listings must come from either a tool or a skill.',
        actionText: 'Back to Profile',
        actionHref: `/users/${req.currentUserId}`
      });
    }

    res.redirect('/listings');
  } catch (err) {
    console.error(err);
    res.send('Error creating listing');
  }
});

module.exports = router;