# Automatic Database Schema Setup

## Overview

The server now **automatically creates database tables** when it starts! No manual setup required. 🎉

## How It Works

1. When the server starts, it automatically runs `initializeDatabase()`
2. The function reads `schema-postgresql.sql` and executes all statements
3. It's **idempotent** - safe to run multiple times (ignores "already exists" errors)
4. The server starts even if some non-critical errors occur

## Console Output

When the server starts, you'll see:

```
🔧 Initializing database schema...
✅ Database schema initialized successfully!
   - 45 statements executed
   - 12 statements skipped (already exist)
🚀 EduAI Platform Server running on port 5000
📚 API available at http://localhost:5000/api
✅ Health check: http://localhost:5000/health
```

## Disable Auto-Setup (Optional)

If you want to disable automatic setup (e.g., for manual migrations), set:

```bash
AUTO_SETUP_DB=false
```

In your environment variables. The server will still start, but won't run schema initialization.

## Manual Setup (Still Available)

You can still run setup manually:

```bash
npm run setup
```

This uses the same `initializeDatabase()` function.

## Benefits

✅ **Zero-config deployment** - Just deploy and it works  
✅ **Idempotent** - Safe to restart multiple times  
✅ **Error-tolerant** - Server starts even if some statements fail  
✅ **Production-ready** - Works perfectly on Render, Heroku, etc.

## First Deployment

1. Create PostgreSQL database on Render
2. Set environment variables (DB_HOST, DB_USER, etc.)
3. Deploy your code
4. **That's it!** Tables are created automatically on first startup

## Troubleshooting

### Tables Not Created
- Check database connection credentials
- Verify `AUTO_SETUP_DB` is not set to `false`
- Check server logs for initialization errors

### "Already Exists" Errors
- These are normal and ignored - the function is idempotent
- Tables already exist, so they're skipped

### Connection Errors
- Server will still start, but database queries will fail
- Check your DB_HOST, DB_USER, DB_PASSWORD, DB_NAME, DB_PORT, DB_SSL settings

