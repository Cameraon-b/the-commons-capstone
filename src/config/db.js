// db.js - This file sets up the connection to the PostgreSQL database using the 'pg' library. It reads database connection parameters from environment variables and exports a pool of connections that can be used throughout the application to execute SQL queries. The pool allows for efficient management of database connections, enabling multiple queries to be handled concurrently without needing to establish a new connection for each query.

const { Pool } = require('pg');

require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

module.exports = pool;