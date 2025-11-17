import pkg from 'pg';
import dotenv from 'dotenv';

const { Pool } = pkg;
dotenv.config();

// PostgreSQL connection pool
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'eduai_platform',
  port: process.env.DB_PORT || 5432,
  max: 10, // Maximum number of clients in the pool
  idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
  connectionTimeoutMillis: 10000, // Return an error after 10 seconds if connection could not be established
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
});

// Handle pool errors
pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
  process.exit(-1);
});

// Create a query wrapper that matches MySQL's interface for easier migration
const db = {
  query: async (text, params) => {
    const result = await pool.query(text, params);
    // Return in format similar to mysql2: [rows, fields]
    // For compatibility, we'll return rows as the first element
    return [result.rows, result.fields];
  }
};

export default db;

