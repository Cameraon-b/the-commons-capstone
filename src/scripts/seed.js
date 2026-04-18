// seed.js - Script to populate the database with sample data for testing and development purposes. This script creates a specified number of users, each with a few tools, skills, and listings. It uses the Faker library to generate realistic fake data and bcrypt to hash passwords before inserting them into the database.

const pool = require('../config/db');
const { faker } = require('@faker-js/faker');
const bcrypt = require('bcrypt');

const NUM_USERS = 10;
const TOOLS_PER_USER = 3;
const SKILLS_PER_USER = 2;
const LISTINGS_PER_USER = 3;

async function seed() {
  try {
    console.log('Seeding database...');

    for (let i = 0; i < NUM_USERS; i++) {
      const name = faker.person.fullName();
      const email = faker.internet.email().toLowerCase();
      const passwordHash = await bcrypt.hash('password123', 10);
      const bio = faker.lorem.sentence();
      const zipCode = faker.location.zipCode('#####');

      const userResult = await pool.query(
        `INSERT INTO users (name, email, password_hash, bio, zip_code)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING user_id`,
        [name, email, passwordHash, bio, zipCode]
      );

      const userId = userResult.rows[0].user_id;

      const toolIds = [];
      for (let t = 0; t < TOOLS_PER_USER; t++) {
        const toolResult = await pool.query(
          `INSERT INTO tools (user_id, name, description, category)
           VALUES ($1, $2, $3, $4)
           RETURNING tool_id`,
          [
            userId,
            faker.commerce.productName(),
            faker.lorem.sentence(),
            faker.helpers.arrayElement(['Tech', 'Garden', 'Repair', 'Cooking', 'Car'])
          ]
        );
        toolIds.push(toolResult.rows[0].tool_id);
      }

      const skillIds = [];
      for (let s = 0; s < SKILLS_PER_USER; s++) {
        const skillResult = await pool.query(
          `INSERT INTO skills (user_id, name, description, category)
           VALUES ($1, $2, $3, $4)
           RETURNING skill_id`,
          [
            userId,
            faker.helpers.arrayElement([
              'Tutoring',
              'Gardening Help',
              'Computer Setup',
              'Meal Prep',
              'Basic Repairs'
            ]),
            faker.lorem.sentence(),
            faker.helpers.arrayElement(['Tech', 'Garden', 'Repair', 'Cooking', 'Car'])
          ]
        );
        skillIds.push(skillResult.rows[0].skill_id);
      }

      for (let l = 0; l < LISTINGS_PER_USER; l++) {
        const isTool = Math.random() > 0.5;
        const category = faker.helpers.arrayElement(['Tech', 'Garden', 'Repair', 'Cooking', 'Car']);

        if (isTool && toolIds.length > 0) {
          const toolId = faker.helpers.arrayElement(toolIds);

          await pool.query(
            `INSERT INTO listings
             (user_id, tool_id, skill_id, type, title, description, category, availability, zip_code, status)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
            [
              userId,
              toolId,
              null,
              'tool',
              faker.commerce.productName(),
              faker.lorem.paragraph(),
              category,
              'Weekends',
              zipCode,
              'available'
            ]
          );
        } else if (skillIds.length > 0) {
          const skillId = faker.helpers.arrayElement(skillIds);

          await pool.query(
            `INSERT INTO listings
             (user_id, tool_id, skill_id, type, title, description, category, availability, zip_code, status)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
            [
              userId,
              null,
              skillId,
              'skill',
              faker.helpers.arrayElement([
                'Help with gardening',
                'Computer troubleshooting',
                'Cooking lessons',
                'Basic home repair help'
              ]),
              faker.lorem.paragraph(),
              category,
              'Evenings',
              zipCode,
              'available'
            ]
          );
        }
      }
    }

    console.log('Done seeding!');
    process.exit();
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

seed();