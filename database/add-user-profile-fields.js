import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'eduai_platform',
  port: process.env.DB_PORT || 3306,
};

async function addUserProfileFields() {
  let connection;
  try {
    connection = await mysql.createConnection(dbConfig);
    console.log('🔧 Adding user profile fields...');

    // Add new columns to users table
    const alterQueries = [
      "ALTER TABLE users ADD COLUMN IF NOT EXISTS school VARCHAR(200) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci AFTER full_name",
      "ALTER TABLE users ADD COLUMN IF NOT EXISTS state VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci AFTER school",
      "ALTER TABLE users ADD COLUMN IF NOT EXISTS country VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci AFTER state",
      "ALTER TABLE users ADD COLUMN IF NOT EXISTS bio TEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci AFTER country",
      "ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(20) AFTER bio",
      "ALTER TABLE users ADD COLUMN IF NOT EXISTS date_of_birth DATE AFTER phone",
      "ALTER TABLE users ADD COLUMN IF NOT EXISTS website VARCHAR(255) AFTER date_of_birth"
    ];

    for (const query of alterQueries) {
      try {
        // MySQL doesn't support IF NOT EXISTS for ALTER TABLE ADD COLUMN, so we check first
        const [columns] = await connection.query(`
          SELECT COLUMN_NAME 
          FROM INFORMATION_SCHEMA.COLUMNS 
          WHERE TABLE_SCHEMA = ? 
          AND TABLE_NAME = 'users' 
          AND COLUMN_NAME = ?
        `, [dbConfig.database, query.match(/ADD COLUMN.*?(\w+)\s/)?.[1] || '']);

        if (columns.length === 0) {
          // Remove IF NOT EXISTS and execute
          const cleanQuery = query.replace(' IF NOT EXISTS', '');
          await connection.query(cleanQuery);
          console.log(`✅ Added column: ${query.match(/ADD COLUMN.*?(\w+)\s/)?.[1]}`);
        } else {
          console.log(`✓ Column already exists: ${query.match(/ADD COLUMN.*?(\w+)\s/)?.[1]}`);
        }
      } catch (error) {
        // Try without IF NOT EXISTS
        try {
          const cleanQuery = query.replace(' IF NOT EXISTS', '');
          await connection.query(cleanQuery);
          console.log(`✅ Added column: ${query.match(/ADD COLUMN.*?(\w+)\s/)?.[1]}`);
        } catch (err) {
          if (err.code === 'ER_DUP_FIELDNAME') {
            console.log(`✓ Column already exists: ${query.match(/ADD COLUMN.*?(\w+)\s/)?.[1]}`);
          } else {
            throw err;
          }
        }
      }
    }

    // Add columns one by one with proper error handling
    const columnsToAdd = [
      { name: 'school', type: 'VARCHAR(200) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci', after: 'full_name' },
      { name: 'state', type: 'VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci', after: 'school' },
      { name: 'country', type: 'VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci', after: 'state' },
      { name: 'bio', type: 'TEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci', after: 'country' },
      { name: 'phone', type: 'VARCHAR(20)', after: 'bio' },
      { name: 'date_of_birth', type: 'DATE', after: 'phone' },
      { name: 'website', type: 'VARCHAR(255)', after: 'date_of_birth' }
    ];

    for (const col of columnsToAdd) {
      try {
        const [existing] = await connection.query(`
          SELECT COLUMN_NAME 
          FROM INFORMATION_SCHEMA.COLUMNS 
          WHERE TABLE_SCHEMA = ? 
          AND TABLE_NAME = 'users' 
          AND COLUMN_NAME = ?
        `, [dbConfig.database, col.name]);

        if (existing.length === 0) {
          await connection.query(`
            ALTER TABLE users 
            ADD COLUMN ${col.name} ${col.type} AFTER ${col.after}
          `);
          console.log(`✅ Added column: ${col.name}`);
        } else {
          console.log(`✓ Column already exists: ${col.name}`);
        }
      } catch (error) {
        if (error.code === 'ER_DUP_FIELDNAME') {
          console.log(`✓ Column already exists: ${col.name}`);
        } else {
          console.error(`❌ Error adding ${col.name}:`, error.message);
        }
      }
    }

    console.log('✨ User profile fields migration completed!');
  } catch (error) {
    console.error('❌ Error adding user profile fields:', error);
    throw error;
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

// Run if called directly
const isMainModule = process.argv[1] && (process.argv[1].includes('add-user-profile-fields') || import.meta.url.includes('add-user-profile-fields'));
if (isMainModule) {
  addUserProfileFields()
    .then(() => {
      console.log('Done!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Failed:', error);
      process.exit(1);
    });
}

export default addUserProfileFields;

