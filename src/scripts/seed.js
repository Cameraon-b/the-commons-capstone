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
  ["Marcus Reed", "marcus@example.com", "Can help with yard work and repairs.", "63123"],
  ["Jenna Lewis", "jenna@example.com", "Gardener and plant lover.", "63109"],
  ["Brian Foster", "brian@example.com", "Always lending tools.", "63031"],
  ["Sofia Nguyen", "sofia@example.com", "Home organizer and creative builder.", "63119"],
  ["Daniel Brooks", "daniel@example.com", "Practical and dependable.", "63026"],
  ["Maya Patel", "maya@example.com", "Crafts and sewing expert.", "63122"],
  ["Ethan Walker", "ethan@example.com", "Heavy lifting and moving help.", "63044"],
  ["Olivia Stone", "olivia@example.com", "Enjoys woodworking and design.", "63141"],
  ["Noah Mitchell", "noah@example.com", "Tech-savvy problem solver.", "63017"],
  ["Grace Kim", "grace@example.com", "Community minded and organized.", "63146"],
  ["Lucas Rivera", "lucas@example.com", "Outdoor enthusiast and handyman.", "63021"],
];

const tools = [
  ["Cordless Drill", "Reliable drill for home projects.", "Home Repair", "Good", "Weekends"],
  ["Step Ladder", "Six-foot ladder.", "Home Repair", "Good", "Evenings"],
  ["Shovel", "Garden and yard shovel.", "Garden", "Fair", "Flexible"],
  ["Hedge Trimmer", "Electric hedge trimmer.", "Garden", "Good", "Weekends"],
  ["Socket Set", "Metric socket set.", "Auto/Home Repair", "Good", "Flexible"],
  ["Wheelbarrow", "Heavy-duty wheelbarrow.", "Garden", "Fair", "Weekends"],
  ["Circular Saw", "Compact circular saw.", "Woodworking", "Good", "Flexible"],
  ["Pressure Washer", "Outdoor cleaning tool.", "Outdoor", "Good", "Weekends"],
  ["Leaf Blower", "Battery-powered blower.", "Garden", "Good", "Flexible"],
  ["Stud Finder", "Wall stud finder.", "Home Repair", "Excellent", "Flexible"],
  ["Soldering Kit", "Electronics repair kit.", "Tech", "Good", "Evenings"],
  ["Paint Sprayer", "Paint sprayer for projects.", "Home", "Good", "Weekends"],
];

const skills = [
  ["Gardening Help", "Planting and garden planning.", "Outdoor", "Intermediate", "Weekends"],
  ["Furniture Assembly", "Assemble desks and shelves.", "Home", "Intermediate", "Evenings"],
  ["Basic Computer Help", "Troubleshoot devices.", "Tech", "Advanced", "Flexible"],
  ["Lawn Care", "Mowing and edging.", "Outdoor", "Intermediate", "Weekends"],
  ["Moving Help", "Boxes and furniture.", "General", "Intermediate", "Flexible"],
  ["Sewing Repair", "Clothing repairs.", "Craft", "Beginner", "Evenings"],
  ["Woodworking Help", "Small woodworking projects.", "Craft", "Advanced", "Weekends"],
  ["Bike Repair", "Tune-ups and repairs.", "Outdoor", "Intermediate", "Flexible"],
  ["Painting Help", "Interior painting.", "Home", "Intermediate", "Weekends"],
  ["Network Setup", "Routers and printers.", "Tech", "Advanced", "Flexible"],
  ["Photography Help", "Portraits and editing.", "Creative", "Intermediate", "Evenings"],
  ["Tutoring", "Math and homework help.", "Education", "Advanced", "Flexible"],
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