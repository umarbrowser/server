# Render PostgreSQL Setup Guide

## Step 1: Create PostgreSQL Database on Render

1. Go to [Render Dashboard](https://dashboard.render.com/new/database)
2. Click **"New Postgres"**
3. Configure your database:
   - **Name**: `eduai-platform-db` (or your preferred name)
   - **Database**: Leave default or specify
   - **User**: Leave default or specify
   - **Region**: Choose the same region as your backend service (e.g., Frankfurt)
   - **PostgreSQL Version**: 18 (or latest)
   - **Plan**: Start with **Free** for testing, upgrade to **Basic** for production
   - **Storage**: 15 GB (adjust as needed)
4. Click **"Create Database"**

## Step 2: Get Database Connection Details

After creation, Render will show you:
- **Internal Database URL** (for services in the same region)
- **External Database URL** (for external connections)
- Individual connection details:
  - Host
  - Port (usually 5432)
  - Database name
  - User
  - Password

## Step 3: Set Environment Variables in Your Backend Service

In your Render backend service dashboard, go to **Environment** tab and add:

```
DB_HOST=<your-postgres-host>
DB_USER=<your-postgres-user>
DB_PASSWORD=<your-postgres-password>
DB_NAME=<your-postgres-database>
DB_PORT=5432
DB_SSL=true
```

**Important**: Use the **Internal Database URL** if your backend is in the same region, or parse the connection string.

### Alternative: Use Connection String

You can also use the full connection string. Update `server/database/db.js` to parse it:

```javascript
// If DATABASE_URL is provided, use it
const connectionString = process.env.DATABASE_URL;
const pool = connectionString 
  ? new Pool({ connectionString, ssl: { rejectUnauthorized: false } })
  : new Pool({ /* individual params */ });
```

## Step 4: Initialize Database Schema

### Option A: Using Render Shell

1. Go to your backend service in Render
2. Click **"Shell"** tab
3. Run:
   ```bash
   cd server
   npm run setup
   ```

### Option B: Using psql (External)

If you have `psql` installed locally:

```bash
psql <your-external-database-url>
```

Then paste the contents of `server/database/schema-postgresql.sql`

### Option C: Using Database GUI

Use a tool like pgAdmin, DBeaver, or TablePlus:
1. Connect using the External Database URL
2. Open `server/database/schema-postgresql.sql`
3. Execute the SQL script

## Step 5: Verify Connection

Test the connection:

```bash
cd server
node test-db-connection.js
```

You should see:
```
✅ Database connected successfully!
✅ Users table exists. Row count: 0
✅ Database connection test passed!
```

## Step 6: Deploy Your Backend

1. Push your code to GitHub
2. Render will automatically deploy
3. Check logs to ensure database connection is successful

## Troubleshooting

### Connection Timeout
- Ensure `DB_SSL=true` is set
- Check that your backend service is in the same region as the database
- Verify firewall/network settings

### Authentication Failed
- Double-check `DB_USER` and `DB_PASSWORD`
- Ensure you're using the correct database credentials from Render dashboard

### Table Not Found
- Run the schema setup: `npm run setup`
- Verify the schema file was executed successfully

### SSL Connection Required
- Set `DB_SSL=true` in environment variables
- Render PostgreSQL requires SSL connections

## Environment Variables Summary

```
# Database
DB_HOST=dpg-xxxxx-a.frankfurt-postgres.render.com
DB_USER=eduai_user
DB_PASSWORD=your_password_here
DB_NAME=eduai_platform
DB_PORT=5432
DB_SSL=true

# Other required variables
JWT_SECRET=your_jwt_secret_here
OPENAI_API_KEY=sk-proj-...
FRONTEND_URL=https://your-frontend-url.com
NODE_ENV=production
PORT=5000
```

## Next Steps

1. ✅ Database created on Render
2. ✅ Environment variables set
3. ✅ Schema initialized
4. ✅ Backend deployed
5. ✅ Test API endpoints

Your EduAI Platform is now ready to use PostgreSQL on Render! 🎉

