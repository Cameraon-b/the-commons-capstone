// routes/listings.js - Handles all routes related to listings, including viewing, creating, editing, and requesting listings.

const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const zipcodes = require('zipcodes');
const { getUserReviews, getUserReviewSummary } = require('../helpers/reviews');

// GET /listings
// Displays a list of all available listings, with optional filtering by zip code, radius, category, and type (tool or skill).
router.get('/', async (req, res) => {
  try {
    const { zip_code, radius, category, type } = req.query;

    let conditions = [`LOWER(listings.status) != 'unavailable'`];
    let values = [];
    let valueIndex = 1;

    // If zip code and radius are provided, we need to find all zip codes within the radius and filter listings by those zip codes. We also calculate the distance for each listing to display it on the frontend.
    if (zip_code && radius) {
      const nearbyZips = zipcodes
        .radius(zip_code, parseInt(radius))
        .map(zip => String(zip));

      conditions.push(`listings.zip_code = ANY($${valueIndex})`);
      values.push(nearbyZips);
      valueIndex++;
    }

    // If category is provided, we filter by category (case-insensitive, partial match)
    if (category) {
      conditions.push(`LOWER(listings.category) LIKE LOWER($${valueIndex})`);
      values.push(`%${category}%`);
      valueIndex++;
    }

    // If type is provided, we filter by type (tool or skill)
    if (type) {
      conditions.push(`LOWER(listings.type) = LOWER($${valueIndex})`);
      values.push(type);
      valueIndex++;
    }

    // Build the final query with dynamic conditions
    let query = `
      SELECT listings.*, users.name
      FROM listings
      JOIN users ON listings.user_id = users.user_id
    `;

    // Add conditions to the query if there are any
    if (conditions.length > 0) {
      query += ` WHERE ` + conditions.join(' AND ');
    }

    query += ` ORDER BY listings.created_at DESC`;

    const result = await pool.query(query, values);
    let listings = result.rows;

    // If we have zip code and radius filters, we calculate the distance for each listing and sort by distance (listings without a valid zip code will be shown at the end). This allows us to display the distance from the user's location for each listing in the search results.
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

      // Sort listings by distance, with null distances (invalid or missing zip codes) at the end
      listings.sort((a, b) => {
        if (a.distance === null) return 1;
        if (b.distance === null) return -1;
        return a.distance - b.distance;
      });
    }

    // Render the listings page with the filtered and sorted listings, and also pass the current filter values so that we can keep the filters populated in the UI.
    res.render('listings', {
      listings,
      currentZip: zip_code || '',
      currentRadius: radius || '',
      currentCategory: category || '',
      currentType: type || ''
    });

  } catch (err) {
    console.error(err);
    res.render('message', {
      title: 'Error Loading Listings',
      message: 'An error occurred while loading listings.',
      actionText: 'Back to Home',
      actionHref: '/'
    });
  }
});

// GET /listings/create
// Renders the form for creating a new listing. Only accessible to logged-in users. If the user has a tool_id or skill_id query parameter, the form will be pre-filled with information from that inventory item.
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

  // If inventory_item is provided, it will be in the format "tool:123" or "skill:456". We can parse this to get the type and ID, which allows us to pre-fill the listing form based on either a tool or skill from the user's inventory.
  if (inventory_item) {
    const [itemType, itemId] = inventory_item.split(':');

    if (itemType === 'tool') {
      tool_id = itemId;
    } else if (itemType === 'skill') {
      skill_id = itemId;
    }
  }

  // We will need to load the user's tools and skills to populate the dropdowns in the listing creation form, and if a specific tool_id or skill_id is provided, we will load that item to pre-fill the form fields.
  try {
    let selectedItem = null;
    let selectedType = '';
    let formData = {
      title: '',
      description: '',
      category: '',
      zip_code: '',
      availability: '',
      image_url: ''
    };

    // We also load the user's zip code to pre-fill the zip code field in the listing form, since most users will likely want to list items near their location. This saves them from having to enter their zip code manually each time they create a listing.
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
        availability: '',
        image_url: ''
      };

      // If the user is creating a listing from a specific tool, we can also pre-fill the category field in the listing form with the category of the tool, since most users will likely want to keep the same category for the listing. This saves them from having to select the category manually in the dropdown.
    } else if (skill_id) {
      const skillResult = await pool.query(
        'SELECT * FROM skills WHERE skill_id = $1 AND user_id = $2',
        [skill_id, req.currentUserId]
      );

      // If the skill specified in the query parameter doesn't exist or doesn't belong to the user, we should show an error message instead of just showing an empty listing form, since the user likely clicked on a "Create Listing" button from a specific skill and would expect the form to be pre-filled with that skill's information.
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
        availability: '',
        image_url: ''
      };
    }

    // Render the listing creation form, passing in the user's tools and skills for the dropdowns, and if a specific tool_id or skill_id was provided, also pass that item to pre-fill the form fields.
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
    res.render('message', {
      title: 'Error Loading Listing Form',
      message: 'An error occurred while loading the listing form.',
      actionText: 'Back to Home',
      actionHref: '/'
    });
  }
});

// GET /listings/:id/edit
// Renders the form for editing an existing listing. Only accessible to the owner of the listing.
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

  // We need to load the listing information to pre-fill the edit form, and we also need to check that the listing belongs to the current user before allowing them to edit it. This ensures that users can only edit their own listings and not listings created by other users.
  try {
    const result = await pool.query(`
      SELECT * FROM listings WHERE listing_id = $1
    `, [id]);

    // If the listing doesn't exist, we should show an error message instead of just showing an empty edit form, since the user likely clicked on an "Edit" button for a specific listing and would expect to see that listing's information in the form.
    if (result.rows.length === 0) {
      return res.render('message', {
        title: 'Listing Not Found',
        message: 'The listing you are trying to edit does not exist.',
        actionText: 'Back to Profile',
        actionHref: `/users/${req.currentUserId}`
      });
    }

    const listing = result.rows[0];

    // Check that the listing belongs to the current user before allowing them to edit it
    if (listing.user_id !== req.currentUserId) {
      return res.status(403).send('You cannot edit this listing.');
    }

    // Render the listing edit form, passing in the listing information to pre-fill the form fields.
    res.render('edit-listing', {
      listing
    });
  } catch (err) {
    console.error(err);
    res.render('message', {
      title: 'Error Loading Listing Edit Form',
      message: 'An error occurred while loading the listing edit form.',
      actionText: 'Back to Profile',
      actionHref: `/users/${req.currentUserId}`
    });
  }
});

// POST /listings/:id/edit
// Handles the submission of the listing edit form. Only the owner of the listing can submit changes.
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
    status,
    image_url
  } = req.body;

  // We need to load the listing information to check that it belongs to the current user before allowing them to edit it. This ensures that users can only edit their own listings and not listings created by other users.
  try {
    const result = await pool.query(`
      SELECT * FROM listings WHERE listing_id = $1
    `, [id]);

    // If the listing doesn't exist, we should show an error message instead of just showing an empty edit form, since the user likely clicked on an "Edit" button for a specific listing and would expect to see that listing's information in the form.
    if (result.rows.length === 0) {
      return res.render('message', {
        title: 'Listing Not Found',
        message: 'The listing you are trying to edit does not exist.',
        actionText: 'Back to Profile',
        actionHref: `/users/${req.currentUserId}`
      });
    }

    const listing = result.rows[0];

    // Check that the listing belongs to the current user before allowing them to edit it
    if (listing.user_id !== req.currentUserId) {
      return res.render('message', {
        title: 'Permission Denied',
        message: 'You cannot edit this listing.',
        actionText: 'Back to Profile',
        actionHref: `/users/${req.currentUserId}`
      });
    }

    await pool.query(`
      UPDATE listings
      SET title = $1, 
          description = $2, 
          category = $3, 
          availability = $4, 
          zip_code = $5,
          status = $6,
          image_url = $7
      WHERE listing_id = $8
    `, [title, description, category, availability, zip_code, status, image_url || null, id]);

    res.redirect(`/users/${req.currentUserId}`);
  } catch (err) {
    console.error(err);
    res.render('message', {
      title: 'Error Updating Listing',
      message: 'An error occurred while updating the listing.',
      actionText: 'Back to Profile',
      actionHref: `/users/${req.currentUserId}`
    });
  }
});

// POST /listings/:id/delete
// Handles the deletion of a listing. Only the owner of the listing can delete it, and listings with request history cannot be deleted.
router.post('/:id/delete', async (req, res) => {
  if (!req.currentUserId) {
    return res.render('message', {
      title: 'Login Required',
      message: 'You must be logged in to delete a listing.',
      actionText: 'Login',
      actionHref: '/users/login'
    });
  }

  // We need to load the listing information to check that it belongs to the current user before allowing them to delete it. This ensures that users can only delete their own listings and not listings created by other users. We also check if the listing has any request history, and if so, we do not allow deletion and show an error message instead, since we want to preserve the integrity of the request history and not leave orphaned requests without a listing.
  const { id } = req.params;

  try {
    const result = await pool.query(`
      SELECT * FROM listings WHERE listing_id = $1
    `, [id]);

    if (result.rows.length === 0) {
      return res.render('message', {
        title: 'Listing Not Found',
        message: 'The listing you are trying to delete does not exist.',
        actionText: 'Back to Profile',
        actionHref: `/users/${req.currentUserId}`
      });
    }

    const listing = result.rows[0];

    // Check that the listing belongs to the current user before allowing them to delete it
    if (listing.user_id !== req.currentUserId) {
      return res.render('message', {
        title: 'Permission Denied',
        message: 'You cannot delete this listing.',
        actionText: 'Back to Profile',
        actionHref: `/users/${req.currentUserId}`
      });
    }

    const requestCheck = await pool.query(`
      SELECT request_id FROM requests WHERE listing_id = $1 LIMIT 1
    `, [id]);

    // If the listing has any request history, we do not allow deletion and show an error message instead, since we want to preserve the integrity of the request history and not leave orphaned requests without a listing.
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

    // After deleting the listing, we redirect the user back to their profile page where they can see the updated list of their listings. This provides a seamless user experience by keeping them within their profile context after performing an action on one of their listings.
    res.redirect(`/users/${req.currentUserId}`);
  } catch (err) {
    console.error(err);
    res.render('message', {
      title: 'Error Deleting Listing',
      message: 'An error occurred while deleting the listing.',
      actionText: 'Back to Profile',
      actionHref: `/users/${req.currentUserId}`
    });
  }
});


// GET /listings/:id
// Displays the details of a specific listing, including the distance from the current user (if logged in), and reviews of the listing owner.
router.get('/:id', async (req, res) => {
  const { id } = req.params;

  //
  try {
    const result = await pool.query(`
      SELECT listings.*, users.name
      FROM listings
      JOIN users ON listings.user_id = users.user_id
      WHERE listings.listing_id = $1
    `, [id]);

    // If the listing doesn't exist, we should show an error message instead of just showing an empty listing detail page, since the user likely clicked on a specific listing and would expect to see that listing's information.
    if (result.rows.length === 0) {
      return res.render('message', {
        title: 'Listing Not Found',
        message: 'The listing you are trying to view does not exist.',
        actionText: 'Back to Listings',
        actionHref: '/listings'
      });
    }

    const listing = result.rows[0];
    let distance = null;

    // If the user is logged in, we can calculate the distance from the user's zip code to the listing's zip code to display it on the listing detail page. This provides useful context for the user about how far away the listing is from them, which can be an important factor in their decision to request the listing or not.
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

    // Render the listing detail page, passing in the listing information, distance from the user, and reviews of the listing owner. This allows the user to see all relevant information about the listing in one place, including how far away it is and what other users have said about the owner.
    res.render('listing-detail', {
      listing,
      distance,
      averageRating,
      reviewCount,
      reviews: reviews.slice(0, 3) // Show only the 3 most recent reviews on the listing page
    });

    // Handles any errors that occur while retrieving the listing information, such as database errors, and shows a user-friendly error message instead of crashing the application.
  } catch (err) {
    console.error(err);
    res.render('message', {
      title: 'Error Retrieving Listing',
      message: 'An error occurred while retrieving the listing.',
      actionText: 'Back to Listings',
      actionHref: '/listings'
    });
  }
});

// POST /listings/:id/request
// Handles the submission of a request for a listing. Only logged-in users can submit requests, and users cannot request their own listings. When a request is created, a notification is also created for the listing owner.
router.post('/:id/request', async (req, res) => {
  if (!req.currentUserId) {
    return res.render('message', {
      title: 'Login Required',
      message: 'You must be logged in to send a request.',
      actionText: 'Login',
      actionHref: '/users/login'
    });
  }

  const { id } = req.params;
  const { request_message, contact_method, contact_value } = req.body;

  // We need to load the listing information to check that the user is not trying to request their own listing, and also to get the listing owner's user ID so that we can create a notification for them when a new request is made. This ensures that users cannot request their own listings and that listing owners are notified when someone requests their listing.
  try {
    const listingResult = await pool.query(
      'SELECT * FROM listings WHERE listing_id = $1',
      [id]
    );

    if (listingResult.rows.length === 0) {
      return res.render('message', {
        title: 'Listing Not Found',
        message: 'The listing you are trying to request does not exist.',
        actionText: 'Back to Listings',
        actionHref: '/listings'
      });
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

    // Create a notification for the listing owner about the new request. This keeps the listing owner informed about activity on their listings and encourages engagement on the platform.
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

    // After submitting the request, we redirect the user back to the listing detail page where they can see the updated request status and any messages related to their request. This provides a seamless user experience by keeping them within the context of the listing they just requested.
    res.redirect('/listings');
  } catch (err) {
    console.error(err);
    res.render('message', {
      title: 'Error Creating Request',
      message: 'An error occurred while creating the request.',
      actionText: 'Back to Listings',
      actionHref: '/listings'
    });
  }
});

// POST /listings
// Handles the submission of the listing creation form. Only logged-in users can create listings, and listings must be associated with a tool or skill from the user's inventory.
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
    zip_code,
    image_url
  } = req.body;

  // We need to validate that the listing is associated with either a tool or a skill from the user's inventory, and we also need to load the relevant tool or skill information to pre-fill certain fields in the listing (like category) if they are not provided in the form. This ensures that listings are properly linked to the user's inventory and that users have a smoother experience when creating listings based on their existing tools or skills.
  try {
    if (type === 'tool') {
      const toolResult = await pool.query(
        'SELECT * FROM tools WHERE tool_id = $1 AND user_id = $2',
        [tool_id, req.currentUserId]
      );

      // If the tool specified in the form doesn't exist or doesn't belong to the user, show an error message instead of just showing an empty listing form
      if (toolResult.rows.length === 0) {
        return res.render('message', {
          title: 'Tool Not Found',
          message: 'You can only create listings from tools in your own inventory.',
          actionText: 'Back to Profile',
          actionHref: `/users/${req.currentUserId}`
        });
      }

      // If the tool exists and belongs to the user, we create the listing with the tool_id and type 'tool'. We also pre-fill the category field in the listing with the category of the tool if it's not provided in the form
      await pool.query(
        `INSERT INTO listings
        (user_id, tool_id, skill_id, type, title, description, category, availability, zip_code, status, image_url)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
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
          'available',
          image_url
        ]
      );
    } else if (type === 'skill') {
      const skillResult = await pool.query(
        'SELECT * FROM skills WHERE skill_id = $1 AND user_id = $2',
        [skill_id, req.currentUserId]
      );

      // If the skill specified in the form doesn't exist or doesn't belong to the user, show an error message instead of just showing an empty listing form
      if (skillResult.rows.length === 0) {
        return res.render('message', {
          title: 'Skill Not Found',
          message: 'You can only create listings from skills in your own profile.',
          actionText: 'Back to Profile',
          actionHref: `/users/${req.currentUserId}`
        });
      }

      // If the skill exists and belongs to the user, we create the listing with the skill_id and type 'skill'. We also pre-fill the category field in the listing with the category of the skill if it's not provided in the form
      await pool.query(
        `INSERT INTO listings
        (user_id, tool_id, skill_id, type, title, description, category, availability, zip_code, status, image_url)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
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
          'available',
          image_url
        ]
      );
      // If the skill exists and belongs to the user, we create the listing with the skill_id and type 'skill'. We also pre-fill the category field in the listing with the category of the skill if it's not provided in the form
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
    res.render('message', {
      title: 'Error Creating Listing',
      message: 'An error occurred while creating the listing.',
      actionText: 'Back to Listings',
      actionHref: '/listings'
    });
  }
});

module.exports = router;