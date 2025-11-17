import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';
import authRoutes from './routes/authRoutes.js';
import courseRoutes from './routes/courseRoutes.js';
import aiRoutes from './routes/aiRoutes.js';
import flashcardRoutes from './routes/flashcardRoutes.js';
import quizRoutes from './routes/quizRoutes.js';
import statsRoutes from './routes/statsRoutes.js';
import { initializeDatabase } from './database/init.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Trust proxy - Required for Render and other reverse proxies
// This allows express-rate-limit to correctly identify client IPs
// Set to 1 to trust only the first proxy (Render's load balancer)
app.set('trust proxy', 1);

// Middleware
const allowedOrigins = process.env.FRONTEND_URL 
  ? process.env.FRONTEND_URL.split(',').map(url => url.trim())
  : ['http://localhost:5173'];

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) !== -1 || process.env.NODE_ENV === 'development') {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});

// Health check endpoints (must be before other routes)
// Handle both /health and /api/health for different cPanel configurations
app.get('/health', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.status(200).json({ 
    status: 'ok', 
    message: 'EduAI Platform API is running',
    timestamp: new Date().toISOString(),
    port: PORT,
    environment: process.env.NODE_ENV || 'development',
    path: req.path
  });
});

app.get('/api/health', async (req, res) => {
  try {
    // Check database connection and tables
    const db = (await import('./database/db.js')).default;
    let dbStatus = 'unknown';
    let tablesStatus = 'unknown';
    
    try {
      await db.query('SELECT 1');
      dbStatus = 'connected';
      
      // Check if users table exists
      const [tables] = await db.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'users'
      `);
      
      tablesStatus = tables.length > 0 ? 'exists' : 'missing';
    } catch (dbError) {
      dbStatus = 'error: ' + dbError.message;
      tablesStatus = 'unknown';
    }

    res.setHeader('Content-Type', 'application/json');
    res.status(200).json({ 
      status: 'ok', 
      message: 'EduAI Platform API is running',
      timestamp: new Date().toISOString(),
      port: PORT,
      environment: process.env.NODE_ENV || 'development',
      path: req.path,
      database: {
        connection: dbStatus,
        tables: tablesStatus
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Health check failed',
      error: error.message
    });
  }
});

// Debug route to see what path Node.js receives (works on any path)
app.get('*', (req, res, next) => {
  // Only respond to debug requests
  if (req.path === '/debug' || req.query.debug === 'true') {
    return res.json({
      originalUrl: req.originalUrl,
      url: req.url,
      path: req.path,
      baseUrl: req.baseUrl,
      method: req.method,
      query: req.query,
      message: 'This shows what path Node.js receives. Use this to configure Application URL correctly.'
    });
  }
  next();
});

app.use('/api/', limiter);

// Routes
// Note: If Application URL in cPanel is 'eduai/api', these routes will be accessible at:
// /eduai/api/auth, /eduai/api/courses, etc.
app.use('/api/auth', authRoutes);
app.use('/api/courses', courseRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/flashcards', flashcardRoutes);
app.use('/api/quizzes', quizRoutes);
app.use('/api/stats', statsRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  console.error('Error stack:', err.stack);
  res.status(500).json({ 
    error: 'Internal server error',
    details: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Initialize database and start server
async function startServer() {
  // Initialize database schema automatically
  await initializeDatabase();
  
  // Start server with error handling
  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 EduAI Platform Server running on port ${PORT}`);
    console.log(`📚 API available at http://localhost:${PORT}/api`);
    console.log(`✅ Health check: http://localhost:${PORT}/health`);
  });

  // Handle server errors
  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      console.error(`❌ Port ${PORT} is already in use. Please use a different port.`);
    } else {
      console.error('❌ Server error:', error);
    }
    process.exit(1);
  });

  // Graceful shutdown
  process.on('SIGTERM', () => {
    console.log('SIGTERM signal received: closing HTTP server');
    server.close(() => {
      console.log('HTTP server closed');
    });
  });
}

startServer();
