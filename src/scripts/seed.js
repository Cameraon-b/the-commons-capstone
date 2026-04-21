const { Pool } = require("pg");
const bcrypt = require("bcrypt");
require("dotenv").config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

const users = [
  ["Alice Carter", "alice@example.com", "Friendly neighbor who loves DIY projects.", "63114"],
  ["Marcus Reed", "marcus@example.com", "Can help with yard work and simple repairs.", "63123"],
  ["Jenna Lewis", "jenna@example.com", "Gardener and plant lover.", "63109"],
  ["Brian Foster", "brian@example.com", "Has extra tools and likes helping people.", "63031"],
  ["Sofia Nguyen", "sofia@example.com", "Enjoys organizing and home improvement.", "63119"],
  ["Daniel Brooks", "daniel@example.com", "Always working on something practical.", "63026"],
  ["Maya Patel", "maya@example.com", "Creative and good with crafts and sewing.", "63122"],
  ["Ethan Walker", "ethan@example.com", "Can help move furniture and do lifting.", "63044"],
];

const tools = [
  ["Cordless Drill", "Reliable drill for home projects.", "Home Repair", "Good", "Weekends only"],
  ["Step Ladder", "Six-foot ladder for painting and reaching shelves.", "Home Repair", "Good", "Most evenings"],
  ["Shovel", "Sturdy shovel for yard or garden work.", "Garden", "Fair", "Flexible"],
  ["Hedge Trimmer", "Electric hedge trimmer for light yard work.", "Garden", "Good", "Weekends"],
  ["Socket Set", "Basic socket set for car and household use.", "Auto/Home Repair", "Good", "Flexible"],
  ["Wheelbarrow", "Useful for mulch, soil, and hauling materials.", "Garden", "Fair", "Weekends"],
];

const skills = [
  ["Gardening Help", "Can help with planting, weeding, and garden planning.", "Outdoor", "Intermediate", "Weekends"],
  ["Furniture Assembly", "Can assemble desks, shelves, and small furniture.", "Home", "Intermediate", "Evenings"],
  ["Basic Computer Help", "Can help set up devices, printers, and troubleshoot common issues.", "Tech", "Advanced", "Flexible"],
  ["Lawn Care", "Can mow, edge, and do basic yard cleanup.", "Outdoor", "Intermediate", "Weekends"],
  ["Moving Help", "Can help lift, organize, and move boxes or furniture.", "General", "Intermediate", "Flexible"],
  ["Sewing Repair", "Can patch clothes and do simple repairs.", "Craft", "Beginner", "Evenings"],
];

async function seed() {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const plainPassword = "Password123!";
    const passwordHash = await bcrypt.hash(plainPassword, 10);

    const insertedUsers = [];

    for (const [name, email, bio, zip] of users) {
      const result = await client.query(
        `
        INSERT INTO users (name, email, password_hash, bio, zip_code)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (email) DO UPDATE
        SET name = EXCLUDED.name,
            bio = EXCLUDED.bio,
            zip_code = EXCLUDED.zip_code
        RETURNING user_id, name, email, zip_code
        `,
        [name, email, passwordHash, bio, zip]
      );

      insertedUsers.push(result.rows[0]);
    }

    const insertedTools = [];
    const insertedSkills = [];

    for (let i = 0; i < tools.length; i++) {
      const owner = insertedUsers[i % insertedUsers.length];
      const [name, description, category, condition, availabilityNotes] = tools[i];

      const result = await client.query(
        `
        INSERT INTO tools (user_id, name, description, category, condition, availability_notes, is_active)
        VALUES ($1, $2, $3, $4, $5, $6, true)
        RETURNING tool_id, user_id, name, category
        `,
        [owner.user_id, name, description, category, condition, availabilityNotes]
      );

      insertedTools.push(result.rows[0]);
    }

    for (let i = 0; i < skills.length; i++) {
      const owner = insertedUsers[i % insertedUsers.length];
      const [name, description, category, experienceLevel, availabilityNotes] = skills[i];

      const result = await client.query(
        `
        INSERT INTO skills (user_id, name, description, category, experience_level, availability_notes, is_active)
        VALUES ($1, $2, $3, $4, $5, $6, true)
        RETURNING skill_id, user_id, name, category
        `,
        [owner.user_id, name, description, category, experienceLevel, availabilityNotes]
      );

      insertedSkills.push(result.rows[0]);
    }

    for (let i = 0; i < insertedTools.length; i++) {
      const tool = insertedTools[i];
      const owner = insertedUsers.find((u) => u.user_id === tool.user_id);

      await client.query(
        `
        INSERT INTO listings (user_id, tool_id, skill_id, type, title, description, category, availability, zip_code, status)
        VALUES ($1, $2, NULL, 'tool', $3, $4, $5, $6, $7, 'available')
        `,
        [
          tool.user_id,
          tool.tool_id,
          tool.name,
          `Borrow my ${tool.name.toLowerCase()} for your next project.`,
          tool.category,
          "Check listing details",
          owner.zip_code,
        ]
      );
    }

    for (let i = 0; i < insertedSkills.length; i++) {
      const skill = insertedSkills[i];
      const owner = insertedUsers.find((u) => u.user_id === skill.user_id);

      await client.query(
        `
        INSERT INTO listings (user_id, tool_id, skill_id, type, title, description, category, availability, zip_code, status)
        VALUES ($1, NULL, $2, 'skill', $3, $4, $5, $6, $7, 'available')
        `,
        [
          skill.user_id,
          skill.skill_id,
          skill.name,
          `Offering help with ${skill.name.toLowerCase()}.`,
          skill.category,
          "Contact for availability",
          owner.zip_code,
        ]
      );
    }

    await client.query("COMMIT");

    console.log("Seed complete.");
    console.log("Test account password for all seeded users:", plainPassword);
    console.log(
      "Seeded emails:",
      insertedUsers.map((u) => u.email).join(", ")
    );
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Seed failed:", error);
  } finally {
    client.release();
    await pool.end();
  }
}

seed();