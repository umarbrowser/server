import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import db from '../database/db.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Register
router.post('/register', async (req, res) => {
  try {
    const { username, email, password, fullName } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Username, email, and password are required' });
    }

    // Validate JWT_SECRET
    if (!process.env.JWT_SECRET) {
      console.error('JWT_SECRET is not set in environment variables');
      return res.status(500).json({ error: 'Server configuration error. Please contact administrator.' });
    }

    // Check database connection
    try {
      await db.query('SELECT 1');
    } catch (dbError) {
      console.error('Database connection error:', dbError);
      return res.status(500).json({ 
        error: 'Database connection failed. Please check server configuration.',
        details: process.env.NODE_ENV === 'development' ? dbError.message : undefined
      });
    }

    // Check if user exists
    const [existingUsers] = await db.query(
      'SELECT id FROM users WHERE email = $1 OR username = $2',
      [email, username]
    );

    if (existingUsers.length > 0) {
      return res.status(400).json({ error: 'User already exists' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user with RETURNING to get the ID
    const [result] = await db.query(
      'INSERT INTO users (username, email, password, full_name) VALUES ($1, $2, $3, $4) RETURNING id',
      [username, email, hashedPassword, fullName || null]
    );

    // Debug: Log result structure
    console.log('Insert result:', JSON.stringify(result, null, 2));
    
    if (!result || !result[0] || !result[0].id) {
      console.error('Unexpected result structure:', result);
      throw new Error('Failed to get user ID from insert result');
    }

    const userId = result[0].id;

    // Generate JWT
    const token = jwt.sign(
      { userId, username, email },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Get created user
    const [users] = await db.query(
      'SELECT id, username, email, full_name, role, points, level FROM users WHERE id = $1',
      [userId]
    );

    res.status(201).json({
      message: 'User registered successfully',
      token,
      user: users[0]
    });
  } catch (error) {
    console.error('Registration error:', error);
    console.error('Error stack:', error.stack);
    
    // Provide more specific error messages (PostgreSQL error codes)
    if (error.code === '42P01') { // undefined_table
      return res.status(500).json({ 
        error: 'Database table not found. Please run database setup.',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
    
    if (error.code === '28000' || error.code === '28P01') { // invalid_authorization_specification
      return res.status(500).json({ 
        error: 'Database access denied. Please check database credentials.',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }

    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      return res.status(500).json({ 
        error: 'Cannot connect to database server. Please check database configuration.',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }

    // Log full error for debugging (always log, but only send details in dev)
    console.error('Full error details:', {
      message: error.message,
      code: error.code,
      detail: error.detail,
      hint: error.hint,
      position: error.position,
      stack: error.stack
    });

    res.status(500).json({ 
      error: 'Server error during registration',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
      // In production, still provide error code for debugging
      errorCode: error.code || 'UNKNOWN'
    });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Find user
    const [users] = await db.query(
      'SELECT * FROM users WHERE email = $1',
      [email]
    );

    if (users.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = users[0];

    // Verify password
    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Generate JWT
    const token = jwt.sign(
      { userId: user.id, username: user.username, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        full_name: user.full_name,
        role: user.role,
        points: user.points,
        level: user.level
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Server error during login' });
  }
});

// Get current user
router.get('/me', authenticateToken, async (req, res) => {
  try {
    // Try with optional columns first, fallback if they don't exist
    let users;
    try {
      [users] = await db.query(
        `SELECT id, username, email, full_name, role, points, level, avatar_url, 
         school, state, country, bio, phone, date_of_birth, website, created_at 
         FROM users WHERE id = $1`,
        [req.user.userId]
      );
    } catch (error) {
      // If optional columns don't exist, query without them
      if (error.code === '42703') { // undefined_column
        console.warn('Optional profile columns not found, using basic query');
        [users] = await db.query(
          `SELECT id, username, email, full_name, role, points, level, avatar_url, 
           NULL::VARCHAR as school, NULL::VARCHAR as state, NULL::VARCHAR as country, 
           NULL::TEXT as bio, NULL::VARCHAR as phone, NULL::DATE as date_of_birth, 
           NULL::VARCHAR as website, created_at 
           FROM users WHERE id = $1`,
          [req.user.userId]
        );
      } else {
        throw error;
      }
    }

    if (users.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ user: users[0] });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update user profile
router.put('/profile', authenticateToken, async (req, res) => {
  try {
    const {
      full_name,
      school,
      state,
      country,
      bio,
      phone,
      date_of_birth,
      website,
      avatar_url
    } = req.body;

    // Build update query dynamically
    const updates = [];
    const values = [];
    let paramIndex = 1;

    if (full_name !== undefined) {
      updates.push(`full_name = $${paramIndex++}`);
      values.push(full_name);
    }
    if (school !== undefined) {
      updates.push(`school = $${paramIndex++}`);
      values.push(school);
    }
    if (state !== undefined) {
      updates.push(`state = $${paramIndex++}`);
      values.push(state);
    }
    if (country !== undefined) {
      updates.push(`country = $${paramIndex++}`);
      values.push(country);
    }
    if (bio !== undefined) {
      updates.push(`bio = $${paramIndex++}`);
      values.push(bio);
    }
    if (phone !== undefined) {
      updates.push(`phone = $${paramIndex++}`);
      values.push(phone);
    }
    if (date_of_birth !== undefined) {
      updates.push(`date_of_birth = $${paramIndex++}`);
      values.push(date_of_birth);
    }
    if (website !== undefined) {
      updates.push(`website = $${paramIndex++}`);
      values.push(website);
    }
    if (avatar_url !== undefined) {
      updates.push(`avatar_url = $${paramIndex++}`);
      values.push(avatar_url);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(req.user.userId);

    try {
      await db.query(
        `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
        values
      );
    } catch (updateError) {
      // If columns don't exist, filter them out and retry
      if (updateError.code === '42703') { // undefined_column
        console.warn('Some profile columns not found, filtering them out');
        // Filter out optional columns that might not exist
        const basicUpdates = updates.filter(update => {
          const column = update.split('=')[0].trim();
          return !['school', 'state', 'country', 'bio', 'phone', 'date_of_birth', 'website'].includes(column);
        });
        
        if (basicUpdates.length === 0) {
          return res.status(400).json({ 
            error: 'Profile columns not yet available. Please wait for database migration to complete.' 
          });
        }
        
        // Rebuild values array with only basic fields
        const basicValues = [req.user.userId];
        await db.query(
          `UPDATE users SET ${basicUpdates.join(', ')} WHERE id = $1`,
          basicValues
        );
      } else {
        throw updateError;
      }
    }

    // Get updated user (with fallback for missing columns)
    let users;
    try {
      [users] = await db.query(
        `SELECT id, username, email, full_name, role, points, level, avatar_url, 
         school, state, country, bio, phone, date_of_birth, website, created_at 
         FROM users WHERE id = $1`,
        [req.user.userId]
      );
    } catch (error) {
      if (error.code === '42703') {
        [users] = await db.query(
          `SELECT id, username, email, full_name, role, points, level, avatar_url, 
           NULL::VARCHAR as school, NULL::VARCHAR as state, NULL::VARCHAR as country, 
           NULL::TEXT as bio, NULL::VARCHAR as phone, NULL::DATE as date_of_birth, 
           NULL::VARCHAR as website, created_at 
           FROM users WHERE id = $1`,
          [req.user.userId]
        );
      } else {
        throw error;
      }
    }

    res.json({ user: users[0], message: 'Profile updated successfully' });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;

