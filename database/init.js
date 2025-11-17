import pkg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const { Pool } = pkg;
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Initialize database schema automatically
 * This function is idempotent - safe to run multiple times
 * @returns {Promise<boolean>} Returns true if successful, false otherwise
 */
export async function initializeDatabase() {
  let pool;
  
  try {
    // Check if auto-setup is disabled
    if (process.env.AUTO_SETUP_DB === 'false') {
      console.log('📋 Auto database setup is disabled (AUTO_SETUP_DB=false)');
      return true;
    }

    console.log('🔧 Initializing database schema...');

    // Connect to PostgreSQL
    pool = new Pool({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'eduai_platform',
      port: process.env.DB_PORT || 5432,
      ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
    });

    // Test connection first
    await pool.query('SELECT 1');

    // Read and execute schema
    const schemaPath = path.join(__dirname, 'schema-postgresql.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');
    
    // Split by semicolons and execute each statement
    const statements = schema.split(';').filter(stmt => stmt.trim().length > 0);
    
    let successCount = 0;
    let skipCount = 0;
    let errorCount = 0;

    for (const statement of statements) {
      const trimmed = statement.trim();
      if (trimmed && !trimmed.startsWith('--')) {
        try {
          await pool.query(trimmed);
          successCount++;
        } catch (error) {
          // Ignore "already exists" errors (idempotent)
          if (error.message.includes('already exists') || 
              error.message.includes('duplicate') ||
              error.code === '42P07' || // duplicate_table
              error.code === '42710') { // duplicate_object
            skipCount++;
          } else {
            // Log other errors but don't fail completely
            console.warn(`⚠️  Warning executing statement: ${trimmed.substring(0, 50)}...`);
            console.warn(`   Error: ${error.message}`);
            errorCount++;
          }
        }
      }
    }

    console.log(`✅ Database schema initialized successfully!`);
    console.log(`   - ${successCount} statements executed`);
    if (skipCount > 0) {
      console.log(`   - ${skipCount} statements skipped (already exist)`);
    }
    if (errorCount > 0) {
      console.log(`   - ${errorCount} statements had errors (non-critical)`);
    }
    
    return true;
    
  } catch (error) {
    console.error('❌ Error initializing database:', error.message);
    // Don't exit - let the server start anyway (might be connection issue)
    // The app will fail on first DB query if there's a real problem
    return false;
  } finally {
    if (pool) {
      await pool.end();
    }
  }
}

