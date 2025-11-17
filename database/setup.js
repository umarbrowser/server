import { initializeDatabase } from './init.js';

// Standalone script to setup database
// Can be run manually: npm run setup
async function setupDatabase() {
  const success = await initializeDatabase();
  
  if (success) {
    console.log('✅ Database setup completed successfully!');
    console.log('You can now start the server with: npm start');
    process.exit(0);
  } else {
    console.error('❌ Database setup failed!');
    process.exit(1);
  }
}

setupDatabase();
