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

    // Check for comments - but don't include them in statements
    if (char === '-' && nextChar === '-') {
      // Skip comment line entirely - don't add to current statement
      while (i < sql.length && sql[i] !== '\n') {
        i++;
      }
      if (i < sql.length) {
        i++; // skip the newline
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
    try {
      const testResult = await pool.query('SELECT 1 as test');
      console.log('✅ Database connection test successful');
      console.log(`   Test query result: ${JSON.stringify(testResult.rows[0])}`);
    } catch (connError) {
      console.error('❌ Database connection test failed!');
      console.error(`   Error: ${connError.message}`);
      console.error(`   Code: ${connError.code}`);
      throw connError; // Re-throw to stop initialization
    }

    // Read and execute schema
    const schemaPath = path.join(__dirname, 'schema-postgresql.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');
    
    // Parse SQL statements properly handling PostgreSQL dollar-quoted strings
    const statements = parseSQLStatements(schema);
    
    console.log(`📋 Parsed ${statements.length} SQL statements`);
    
    // Debug: Log first few statements (filter out comments)
    const nonCommentStatements = statements.filter(s => {
      const trimmed = s.trim();
      return trimmed && !trimmed.startsWith('--') && trimmed !== ';';
    });
    
    console.log(`   Total statements: ${statements.length}`);
    console.log(`   Non-comment statements: ${nonCommentStatements.length}`);
    
    // Show first 3 non-comment statements for debugging
    if (nonCommentStatements.length > 0) {
      console.log(`   First 3 statements:`);
      for (let i = 0; i < Math.min(3, nonCommentStatements.length); i++) {
        const stmt = nonCommentStatements[i].trim();
        console.log(`     [${i}] ${stmt.substring(0, 60)}...`);
      }
    }
    
    let successCount = 0;
    let skipCount = 0;
    let errorCount = 0;

    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      const trimmed = statement.trim();
      
      // Skip empty statements, comments, and whitespace-only statements
      if (!trimmed || trimmed.startsWith('--') || trimmed === ';' || trimmed.length === 0) {
        if (trimmed && trimmed.startsWith('--')) {
          // Debug: Log skipped comments
          console.log(`   [SKIP] Comment: ${trimmed.substring(0, 40)}...`);
        }
        continue;
      }
      
      // Debug: Log what we're about to execute (first 5 statements)
      if (i < 5) {
        console.log(`   [${i}] Statement type: ${trimmed.substring(0, 30).toUpperCase()}...`);
      }
      
      // Remove any trailing semicolons if present (but keep the statement)
      const cleanStatement = trimmed.endsWith(';') ? trimmed.slice(0, -1).trim() : trimmed;
      
      if (!cleanStatement || cleanStatement.length === 0) {
        continue;
      }
      
      // Debug: Log CREATE TABLE and FUNCTION statements
      const upperStatement = cleanStatement.toUpperCase();
      if (upperStatement.startsWith('CREATE TABLE')) {
        console.log(`📝 Executing CREATE TABLE: ${cleanStatement.substring(0, 60)}...`);
      } else if (upperStatement.startsWith('CREATE OR REPLACE FUNCTION')) {
        console.log(`📝 Executing FUNCTION: ${cleanStatement.substring(0, 60)}...`);
      }
      
      try {
        await pool.query(cleanStatement);
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
        
        // Check if users table has profile columns, add them if missing
        try {
          const [columns] = await pool.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_schema = 'public' 
            AND table_name = 'users'
            AND column_name IN ('school', 'state', 'country', 'bio', 'phone', 'date_of_birth', 'website')
          `);
          
          const existingColumns = columns.map(c => c.column_name);
          const requiredColumns = ['school', 'state', 'country', 'bio', 'phone', 'date_of_birth', 'website'];
          const missingColumns = requiredColumns.filter(col => !existingColumns.includes(col));
          
          if (missingColumns.length > 0) {
            console.log(`📝 Adding missing profile columns to users table: ${missingColumns.join(', ')}`);
            
            // Add missing columns
            if (missingColumns.includes('school')) {
              await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS school VARCHAR(255)');
            }
            if (missingColumns.includes('state')) {
              await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS state VARCHAR(100)');
            }
            if (missingColumns.includes('country')) {
              await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS country VARCHAR(100)');
            }
            if (missingColumns.includes('bio')) {
              await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS bio TEXT');
            }
            if (missingColumns.includes('phone')) {
              await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(20)');
            }
            if (missingColumns.includes('date_of_birth')) {
              await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS date_of_birth DATE');
            }
            if (missingColumns.includes('website')) {
              await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS website VARCHAR(255)');
            }
            
            console.log(`✅ Added missing profile columns`);
          }
        } catch (columnError) {
          console.warn(`⚠️  Could not check/add profile columns: ${columnError.message}`);
        }
      }
      // Store missingTables for later use
      var hasMissingTables = missingTables.length > 0;
    } catch (verifyError) {
      console.error(`❌ Error verifying tables: ${verifyError.message}`);
      console.error(`   This might indicate a database connection or query issue.`);
      var hasMissingTables = true; // Assume missing if we can't verify
    }

    console.log(`✅ Database schema initialized!`);
    console.log(`   - ${successCount} statements executed`);
    if (skipCount > 0) {
      console.log(`   - ${skipCount} statements skipped (already exist)`);
    }
    if (errorCount > 0) {
      console.log(`   - ⚠️  ${errorCount} statements had errors`);
    }
    
    // Check if we have missing tables (if verification succeeded)
    if (typeof hasMissingTables !== 'undefined' && hasMissingTables) {
      console.log(`   - ❌ Some critical tables are missing - check errors above`);
      return false;
    }
    
    return successCount > 0 && errorCount === 0;
    
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

