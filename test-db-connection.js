// Test database connection script (PostgreSQL)
// Run this via SSH: node test-db-connection.js

import pkg from 'pg';
import dotenv from 'dotenv';

const { Pool } = pkg;
dotenv.config();

async function testConnection() {
  let pool;
  
  try {
    console.log('🔍 Testing PostgreSQL database connection...');
    console.log('Host:', process.env.DB_HOST || 'localhost');
    console.log('User:', process.env.DB_USER);
    console.log('Database:', process.env.DB_NAME);
    console.log('Port:', process.env.DB_PORT || 5432);
    
    pool = new Pool({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      port: parseInt(process.env.DB_PORT || 5432),
      ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
    });
    
    // Test connection
    const result = await pool.query('SELECT NOW() as current_time');
    console.log('✅ Database connected successfully!');
    console.log('Current time:', result.rows[0].current_time);
    
    // Test query - check if users table exists
    try {
      const result = await pool.query('SELECT COUNT(*) as count FROM users');
      console.log('✅ Users table exists. Row count:', result.rows[0].count);
    } catch (tableError) {
      if (tableError.code === '42P01') { // undefined_table
        console.error('❌ Users table does not exist!');
        console.error('   Please run: npm run setup');
      } else {
        throw tableError;
      }
    }
    
    console.log('✅ Database connection test passed!');
    
    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error('❌ Database connection failed!');
    console.error('Error code:', error.code);
    console.error('Error message:', error.message);
    
    if (error.code === '28P01') { // invalid_password
      console.error('\n💡 Solution: Check database username and password');
    } else if (error.code === '3D000') { // invalid_catalog_name
      console.error('\n💡 Solution: Database does not exist. Create it in Render PostgreSQL dashboard');
    } else if (error.code === 'ECONNREFUSED') {
      console.error('\n💡 Solution: Cannot connect to database server. Check DB_HOST and DB_PORT');
    } else if (error.code === 'ETIMEDOUT') {
      console.error('\n💡 Solution: Connection timeout. Check database server status and network');
    } else if (error.code === 'ENOTFOUND') {
      console.error('\n💡 Solution: Database host not found. Check DB_HOST environment variable');
    }
    
    if (pool) {
      await pool.end();
    }
    process.exit(1);
  }
}

testConnection();
