const pool = require('../config/db');

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