# PostgreSQL Migration Guide

## Changes Made

1. **Database Connection**: Changed from `mysql2` to `pg` (node-postgres)
2. **Query Parameters**: Changed from `?` to `$1, $2, $3...`
3. **INSERT Queries**: Use `RETURNING id` instead of `insertId`
4. **Functions**: `NOW()` → `CURRENT_TIMESTAMP`
5. **Schema**: Converted MySQL schema to PostgreSQL with proper types

## Environment Variables for Render

Set these in your Render dashboard:

```
DB_HOST=<your-postgres-host>
DB_USER=<your-postgres-user>
DB_PASSWORD=<your-postgres-password>
DB_NAME=<your-postgres-database>
DB_PORT=5432
DB_SSL=true
```

## Database Setup

1. Create PostgreSQL database in Render
2. Run the schema: `server/database/schema-postgresql.sql`
3. Update environment variables
4. Deploy!

