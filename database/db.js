import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

const pool = mysql.createPool({
  host: process.env.DB_HOST,        // cPanel host, e.g., das114.truehost.cloud
  user: process.env.DB_USER,        // cPanel database user
  password: process.env.DB_PASS,    // cPanel password
  database: process.env.DB_NAME,    // cPanel database name
  port: process.env.DB_PORT || 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  charset: 'utf8mb4'
  // Do NOT add SSL unless cPanel requires it
});

export default pool;
