// db.js - This file sets up the connection to the PostgreSQL database using the 'pg' library. It reads database connection parameters from environment variables and exports a pool of connections that can be used throughout the application to execute SQL queries. The pool allows for efficient management of database connections, enabling multiple queries to be handled concurrently without needing to establish a new connection for each query.

const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

module.exports = pool;
