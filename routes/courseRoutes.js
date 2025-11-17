import express from 'express';
import db from '../database/db.js';
import { authenticateToken, optionalAuth } from '../middleware/auth.js';
import { generateCourseOutline, generateModuleContent } from '../services/aiService.js';

const router = express.Router();

// Get all courses (public, with optional auth for enrolled status)
router.get('/', optionalAuth, async (req, res) => {
  try {
    // Show published courses to everyone, or unpublished courses to their creator
    const whereClause = req.user 
      ? 'WHERE c.is_published = TRUE OR c.instructor_id = ?'
      : 'WHERE c.is_published = TRUE';
    
    let query = `
      SELECT 
        c.*,
        u.username as instructor_name,
        u.full_name as instructor_full_name,
        COUNT(DISTINCT e.user_id) as enrollment_count
      FROM courses c
      LEFT JOIN users u ON c.instructor_id = u.id
      LEFT JOIN enrollments e ON c.id = e.course_id
      ${whereClause}
      GROUP BY c.id
      ORDER BY c.created_at DESC
    `;

    const params = req.user ? [req.user.userId] : [];
    const [courses] = await db.query(query, params);

    // If user is authenticated, add enrollment status
    if (req.user) {
      const courseIds = courses.map(c => c.id);
      if (courseIds.length > 0) {
        const [enrollments] = await db.query(
          'SELECT course_id, progress_percentage FROM enrollments WHERE user_id = ? AND course_id IN (?)',
          [req.user.userId, courseIds]
        );
        
        const enrollmentMap = {};
        enrollments.forEach(e => {
          enrollmentMap[e.course_id] = e.progress_percentage;
        });

        courses.forEach(course => {
          course.is_enrolled = enrollmentMap[course.id] !== undefined;
          course.progress = enrollmentMap[course.id] || 0;
        });
      }
    }

    res.json({ courses });
  } catch (error) {
    console.error('Get courses error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get single course with modules
router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const courseId = parseInt(req.params.id);

    // Get course
    const [courses] = await db.query(
      `SELECT c.*, u.username as instructor_name, u.full_name as instructor_full_name
       FROM courses c
       LEFT JOIN users u ON c.instructor_id = u.id
       WHERE c.id = ?`,
      [courseId]
    );

    if (courses.length === 0) {
      return res.status(404).json({ error: 'Course not found' });
    }

    const course = courses[0];

    // Get modules
    const [modules] = await db.query(
      'SELECT * FROM course_modules WHERE course_id = ? ORDER BY order_index ASC',
      [courseId]
    );

    course.modules = modules;

    // Get enrollment status if authenticated
    if (req.user) {
      const [enrollments] = await db.query(
        'SELECT * FROM enrollments WHERE user_id = ? AND course_id = ?',
        [req.user.userId, courseId]
      );
      course.is_enrolled = enrollments.length > 0;
      course.progress = enrollments.length > 0 ? enrollments[0].progress_percentage : 0;
      course.is_instructor = course.instructor_id === req.user.userId;
    }

    res.json({ course });
  } catch (error) {
    console.error('Get course error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create course (instructor only)
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { title, description, category, difficulty, thumbnail_url } = req.body;

    if (!title) {
      return res.status(400).json({ error: 'Course title is required' });
    }

    const [result] = await db.query(
      'INSERT INTO courses (instructor_id, title, description, category, difficulty, thumbnail_url, is_published) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [req.user.userId, title, description || null, category || null, difficulty || 'beginner', thumbnail_url || null, true]
    );

    const [courses] = await db.query('SELECT * FROM courses WHERE id = ?', [result.insertId]);
    res.status(201).json({ course: courses[0] });
  } catch (error) {
    console.error('Create course error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Generate course outline with AI
router.post('/generate-outline', authenticateToken, async (req, res) => {
  try {
    const { topic, difficulty } = req.body;

    if (!topic) {
      return res.status(400).json({ error: 'Topic is required' });
    }

    console.log('Course outline generation request:', { topic, difficulty, userId: req.user.userId });
    
    const modules = await generateCourseOutline(topic, difficulty || 'beginner');
    
    console.log('Course outline generated successfully:', modules.length, 'modules');
    res.json({ modules });
  } catch (error) {
    console.error('Generate outline error:', error);
    const errorMessage = error.message || 'Failed to generate course outline';
    
    // Return more specific error messages
    if (errorMessage.includes('API key')) {
      res.status(500).json({ 
        error: errorMessage,
        hint: 'Please check that OPENAI_API_KEY is set in your .env file and restart the server'
      });
    } else if (errorMessage.includes('rate limit')) {
      res.status(429).json({ error: errorMessage });
    } else if (errorMessage.includes('quota') || errorMessage.includes('401')) {
      res.status(500).json({ 
        error: errorMessage,
        hint: 'Please check your OpenAI API key and billing status'
      });
    } else {
      res.status(500).json({ error: errorMessage });
    }
  }
});

// Add module to course
router.post('/:id/modules', authenticateToken, async (req, res) => {
  try {
    const courseId = parseInt(req.params.id);
    const { title, content, video_url, duration_minutes, order_index } = req.body;

    // Verify course ownership
    const [courses] = await db.query(
      'SELECT instructor_id FROM courses WHERE id = ?',
      [courseId]
    );

    if (courses.length === 0) {
      return res.status(404).json({ error: 'Course not found' });
    }

    if (courses[0].instructor_id !== req.user.userId) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const [result] = await db.query(
      'INSERT INTO course_modules (course_id, title, content, video_url, duration_minutes, order_index) VALUES (?, ?, ?, ?, ?, ?)',
      [courseId, title, content || null, video_url || null, duration_minutes || null, order_index || 0]
    );

    const [modules] = await db.query('SELECT * FROM course_modules WHERE id = ?', [result.insertId]);
    res.status(201).json({ module: modules[0] });
  } catch (error) {
    console.error('Add module error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Generate module content with AI
router.post('/:id/modules/generate', authenticateToken, async (req, res) => {
  try {
    const courseId = parseInt(req.params.id);
    const { moduleTitle, description, keyPoints } = req.body;

    if (!moduleTitle) {
      return res.status(400).json({ error: 'Module title is required' });
    }

    // If courseId is 0, skip ownership check (used for content generation before course creation)
    if (courseId !== 0) {
      // Verify course ownership
      const [courses] = await db.query(
        'SELECT instructor_id FROM courses WHERE id = ?',
        [courseId]
      );

      if (courses.length === 0) {
        return res.status(404).json({ error: 'Course not found' });
      }

      if (courses[0].instructor_id !== req.user.userId) {
        return res.status(403).json({ error: 'Not authorized' });
      }
    }

    console.log('Generating module content:', { moduleTitle, description, keyPoints });
    const content = await generateModuleContent(moduleTitle, description || '', keyPoints || []);
    console.log('Module content generated successfully, length:', content?.length || 0);
    res.json({ content });
  } catch (error) {
    console.error('Generate content error:', error);
    const errorMessage = error.message || 'Failed to generate content';
    
    if (errorMessage.includes('API key')) {
      res.status(500).json({ 
        error: errorMessage,
        hint: 'Please check that OPENAI_API_KEY is set in your .env file and restart the server'
      });
    } else {
      res.status(500).json({ error: errorMessage });
    }
  }
});

// Enroll in course
router.post('/:id/enroll', authenticateToken, async (req, res) => {
  try {
    const courseId = parseInt(req.params.id);

    // Check if already enrolled
    const [existing] = await db.query(
      'SELECT * FROM enrollments WHERE user_id = ? AND course_id = ?',
      [req.user.userId, courseId]
    );

    if (existing.length > 0) {
      return res.status(400).json({ error: 'Already enrolled in this course' });
    }

    await db.query(
      'INSERT INTO enrollments (user_id, course_id) VALUES (?, ?)',
      [req.user.userId, courseId]
    );

    // Award points for enrollment
    await db.query('UPDATE users SET points = points + 10 WHERE id = ?', [req.user.userId]);

    res.json({ message: 'Successfully enrolled in course' });
  } catch (error) {
    console.error('Enrollment error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update course progress
router.put('/:id/progress', authenticateToken, async (req, res) => {
  try {
    const courseId = parseInt(req.params.id);
    const { progress_percentage } = req.body;

    await db.query(
      'UPDATE enrollments SET progress_percentage = ? WHERE user_id = ? AND course_id = ?',
      [progress_percentage, req.user.userId, courseId]
    );

    // If completed, mark as completed
    if (progress_percentage >= 100) {
      await db.query(
        'UPDATE enrollments SET completed_at = CURRENT_TIMESTAMP WHERE user_id = ? AND course_id = ?',
        [req.user.userId, courseId]
      );
      // Award completion points
      await db.query('UPDATE users SET points = points + 50 WHERE id = ?', [req.user.userId]);
    }

    res.json({ message: 'Progress updated' });
  } catch (error) {
    console.error('Update progress error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get user's courses
router.get('/user/my-courses', authenticateToken, async (req, res) => {
  try {
    const [courses] = await db.query(
      `SELECT 
        c.*,
        e.progress_percentage,
        e.enrolled_at,
        e.completed_at,
        u.username as instructor_name
      FROM enrollments e
      JOIN courses c ON e.course_id = c.id
      LEFT JOIN users u ON c.instructor_id = u.id
      WHERE e.user_id = ?
      ORDER BY e.enrolled_at DESC`,
      [req.user.userId]
    );

    res.json({ courses });
  } catch (error) {
    console.error('Get user courses error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete course (instructor only)
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const courseId = parseInt(req.params.id);

    // Verify course ownership
    const [courses] = await db.query(
      'SELECT instructor_id FROM courses WHERE id = ?',
      [courseId]
    );

    if (courses.length === 0) {
      return res.status(404).json({ error: 'Course not found' });
    }

    if (courses[0].instructor_id !== req.user.userId) {
      return res.status(403).json({ error: 'Not authorized to delete this course' });
    }

    // Delete course (cascade will handle modules and enrollments)
    await db.query('DELETE FROM courses WHERE id = ?', [courseId]);

    res.json({ message: 'Course deleted successfully' });
  } catch (error) {
    console.error('Delete course error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;

