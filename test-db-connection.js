// Test database connection script
// Run this via SSH: node test-db-connection.js

import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

async function testConnection() {
  let connection;
  
  try {
    console.log('🔍 Testing database connection...');
    console.log('Host:', process.env.DB_HOST || 'localhost');
    console.log('User:', process.env.DB_USER);
    console.log('Database:', process.env.DB_NAME);
    console.log('Port:', process.env.DB_PORT || 3306);
    
    connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      port: parseInt(process.env.DB_PORT || 3306),
      charset: 'utf8mb4'
    });
    
    console.log('✅ Database connected successfully!');
    
    // Test query - check if users table exists
    try {
      const [rows] = await connection.query('SELECT COUNT(*) as count FROM users');
      console.log('✅ Users table exists. Row count:', rows[0].count);
    } catch (tableError) {
      if (tableError.code === 'ER_NO_SUCH_TABLE') {
        console.error('❌ Users table does not exist!');
        console.error('   Please import schema-cpanel.sql via phpMyAdmin');
      } else {
        throw tableError;
      }
    }
    
    // Test insert (will rollback)
    console.log('✅ Database connection test passed!');
    
    await connection.end();
    process.exit(0);
  } catch (error) {
    console.error('❌ Database connection failed!');
    console.error('Error code:', error.code);
    console.error('Error message:', error.message);
    
    if (error.code === 'ER_ACCESS_DENIED_ERROR') {
      console.error('\n💡 Solution: Check database username and password');
    } else if (error.code === 'ER_BAD_DB_ERROR') {
      console.error('\n💡 Solution: Database does not exist. Create it in cPanel MySQL Databases');
    } else if (error.code === 'ECONNREFUSED') {
      console.error('\n💡 Solution: Cannot connect to database server. Check DB_HOST');
    } else if (error.code === 'ETIMEDOUT') {
      console.error('\n💡 Solution: Connection timeout. Check database server status');
    }
    
    process.exit(1);
  }
}

testConnection();


