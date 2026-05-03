// This file contains helper functions for managing user reviews in the application. It includes functions to retrieve a user's reviews and to calculate the average rating and review count for a user. The functions interact with the database using SQL queries to fetch the necessary data.

const pool = require('../config/db');

// Retrieves all reviews for a specific user, including the reviewer's name. The reviews are ordered by creation date in descending order.
async function getUserReviews(userId) {
  const reviewsResult = await pool.query(
    `
    SELECT reviews.*, users.name AS reviewer_name
    FROM reviews
    JOIN users ON reviews.reviewer_id = users.user_id
    WHERE reviewed_user_id = $1
    ORDER BY reviews.created_at DESC
    `,
    [userId]
  );

  return reviewsResult.rows;
}

async function getUserReviewSummary(userId) {
  const avgResult = await pool.query(
    `
    SELECT 
      AVG(rating)::numeric(10,2) AS average_rating,
      COUNT(*) AS review_count
    FROM reviews
    WHERE reviewed_user_id = $1
    `,
    [userId]
  );

  return {
    averageRating: avgResult.rows[0].average_rating,
    reviewCount: Number(avgResult.rows[0].review_count)
  };
}

module.exports = {
  getUserReviews,
  getUserReviewSummary
};