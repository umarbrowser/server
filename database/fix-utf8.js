import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

async function fixUtf8Encoding() {
  let connection;
  
  try {
    connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'eduai_platform',
      port: process.env.DB_PORT || 3306,
      charset: 'utf8mb4'
    });

    console.log('🔧 Fixing UTF-8 encoding for database tables...');

    // Set database default charset
    await connection.query(`ALTER DATABASE ${process.env.DB_NAME || 'eduai_platform'} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);

    // Fix all TEXT columns to use utf8mb4
    const tables = [
      { table: 'courses', columns: ['title', 'description'] },
      { table: 'course_modules', columns: ['title', 'content'] },
      { table: 'flashcards', columns: ['front_text', 'back_text'] },
      { table: 'quizzes', columns: ['title', 'description'] },
      { table: 'quiz_questions', columns: ['question_text', 'correct_answer'] },
      { table: 'ai_conversations', columns: ['title'] },
      { table: 'ai_messages', columns: ['content'] },
      { table: 'users', columns: ['username', 'email', 'full_name'] }
    ];

    for (const { table, columns } of tables) {
      for (const column of columns) {
        try {
          // Get current column type
          const [columns] = await connection.query(
            `SELECT COLUMN_TYPE, CHARACTER_SET_NAME 
             FROM INFORMATION_SCHEMA.COLUMNS 
             WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
            [process.env.DB_NAME || 'eduai_platform', table, column]
          );

          if (columns.length > 0) {
            const colType = columns[0].COLUMN_TYPE;
            const charset = columns[0].CHARACTER_SET_NAME;

            if (charset !== 'utf8mb4') {
              // Determine if it's VARCHAR or TEXT
              let newType = colType;
              if (colType.includes('VARCHAR')) {
                newType = colType.replace(/CHARACTER SET \w+/i, '').replace(/COLLATE \w+/i, '') + ' CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci';
              } else if (colType.includes('TEXT')) {
                newType = 'TEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci';
              }

              await connection.query(
                `ALTER TABLE ${table} MODIFY COLUMN ${column} ${newType}`
              );
              console.log(`✅ Fixed ${table}.${column}`);
            } else {
              console.log(`✓ ${table}.${column} already uses utf8mb4`);
            }
          }
        } catch (error) {
          console.error(`❌ Error fixing ${table}.${column}:`, error.message);
        }
      }
    }

    console.log('✨ UTF-8 encoding fix completed!');
  } catch (error) {
    console.error('❌ Error fixing UTF-8 encoding:', error);
    throw error;
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

// Run if called directly
const isMainModule = process.argv[1] && (process.argv[1].includes('fix-utf8') || import.meta.url.includes('fix-utf8'));
if (isMainModule) {
  fixUtf8Encoding()
    .then(() => {
      console.log('Done!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Failed:', error);
      process.exit(1);
    });
}

export default fixUtf8Encoding;

