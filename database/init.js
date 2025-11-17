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
 * Parse SQL statements handling PostgreSQL dollar-quoted strings
 * @param {string} sql - SQL content
 * @returns {string[]} Array of SQL statements
 */
function parseSQLStatements(sql) {
  const statements = [];
  let currentStatement = '';
  let inDollarQuote = false;
  let dollarTag = '';
  let i = 0;

  while (i < sql.length) {
    const char = sql[i];
    const nextChar = sql[i + 1];

    // Check for dollar-quoted strings ($$ or $tag$)
    if (char === '$' && !inDollarQuote) {
      // Check if this is the start of a dollar quote
      let tagEnd = sql.indexOf('$', i + 1);
      if (tagEnd > i) {
        dollarTag = sql.substring(i, tagEnd + 1);
        inDollarQuote = true;
        currentStatement += dollarTag;
        i = tagEnd + 1;
        continue;
      }
    }

    // Check for end of dollar quote
    if (inDollarQuote && sql.substring(i).startsWith(dollarTag)) {
      currentStatement += dollarTag;
      i += dollarTag.length;
      inDollarQuote = false;
      dollarTag = '';
      continue;
    }

    // If we're in a dollar quote, just add the character
    if (inDollarQuote) {
      currentStatement += char;
      i++;
      continue;
    }

    // Check for comments
    if (char === '-' && nextChar === '-') {
      // Skip to end of line
      while (i < sql.length && sql[i] !== '\n') {
        currentStatement += sql[i];
        i++;
      }
      if (i < sql.length) {
        currentStatement += sql[i]; // include the newline
        i++;
      }
      continue;
    }

    // Check for statement terminator (semicolon outside of dollar quotes)
    if (char === ';' && !inDollarQuote) {
      currentStatement += char;
      const trimmed = currentStatement.trim();
      if (trimmed && trimmed !== ';') {
        statements.push(trimmed);
      }
      currentStatement = '';
      i++;
      continue;
    }

    // Add character to current statement
    currentStatement += char;
    i++;
  }

  // Add any remaining statement
  const trimmed = currentStatement.trim();
  if (trimmed) {
    statements.push(trimmed);
  }

  return statements;
}

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
    
    // Parse SQL statements properly handling PostgreSQL dollar-quoted strings
    const statements = parseSQLStatements(schema);
    
    console.log(`📋 Parsed ${statements.length} SQL statements`);
    
    // Debug: Log first few statements
    if (statements.length > 0) {
      console.log(`   First statement: ${statements[0].substring(0, 60)}...`);
    }
    
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
            // Log errors - especially important for CREATE TABLE
            const isCreateTable = trimmed.toUpperCase().startsWith('CREATE TABLE');
            if (isCreateTable) {
              console.error(`❌ ERROR creating table: ${trimmed.substring(0, 80)}...`);
              console.error(`   Error code: ${error.code}`);
              console.error(`   Error message: ${error.message}`);
              console.error(`   Error detail: ${error.detail || 'none'}`);
            } else {
              console.warn(`⚠️  Warning executing statement: ${trimmed.substring(0, 50)}...`);
              console.warn(`   Error: ${error.message}`);
            }
            errorCount++;
          }
        }
      }
    }

    // Verify critical tables were created
    try {
      const result = await pool.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name IN ('users', 'courses', 'enrollments')
      `);
      
      const tableNames = result.rows.map(t => t.table_name);
      const criticalTables = ['users', 'courses', 'enrollments'];
      const missingTables = criticalTables.filter(t => !tableNames.includes(t));
      
      if (missingTables.length > 0) {
        console.error(`❌ Critical tables missing: ${missingTables.join(', ')}`);
        console.error(`   Existing tables: ${tableNames.join(', ') || 'none'}`);
        console.error(`   This indicates schema initialization had issues.`);
        console.error(`   Please check the errors above and ensure all statements executed.`);
      } else {
        console.log(`✅ Critical tables verified: ${tableNames.join(', ')}`);
      }
    } catch (verifyError) {
      console.error(`❌ Error verifying tables: ${verifyError.message}`);
      console.error(`   This might indicate a database connection or query issue.`);
    }

    console.log(`✅ Database schema initialized!`);
    console.log(`   - ${successCount} statements executed`);
    if (skipCount > 0) {
      console.log(`   - ${skipCount} statements skipped (already exist)`);
    }
    if (errorCount > 0) {
      console.log(`   - ⚠️  ${errorCount} statements had errors`);
      if (missingTables.length > 0) {
        console.log(`   - ❌ Some critical tables are missing - check errors above`);
      }
    }
    
    return missingTables.length === 0;
    
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

