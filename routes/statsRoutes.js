import express from 'express';
import db from '../database/db.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Get user stats
router.get('/user', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;

    // Get user info
    const [users] = await db.query(
      'SELECT points, level FROM users WHERE id = ?',
      [userId]
    );

    // Get enrollment count
    const [enrollments] = await db.query(
      'SELECT COUNT(*) as total, SUM(CASE WHEN completed_at IS NOT NULL THEN 1 ELSE 0 END) as completed FROM enrollments WHERE user_id = ?',
      [userId]
    );

    // Get study sessions stats
    const [sessions] = await db.query(
      'SELECT COUNT(*) as total_sessions, SUM(duration_minutes) as total_minutes, SUM(points_earned) as total_points FROM study_sessions WHERE user_id = ?',
      [userId]
    );

    // Get flashcards stats
    const [flashcards] = await db.query(
      'SELECT COUNT(*) as total, SUM(CASE WHEN next_review <= NOW() OR next_review IS NULL THEN 1 ELSE 0 END) as due FROM flashcards WHERE user_id = ?',
      [userId]
    );

    // Get quiz attempts
    const [quizzes] = await db.query(
      'SELECT COUNT(*) as total_attempts, AVG(score) as avg_score FROM quiz_attempts WHERE user_id = ?',
      [userId]
    );

    // Get recent activity
    const [recentActivity] = await db.query(
      `SELECT 
        session_type,
        duration_minutes,
        points_earned,
        created_at
      FROM study_sessions
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT 10`,
      [userId]
    );

    res.json({
      user: users[0],
      courses: {
        enrolled: enrollments[0].total || 0,
        completed: enrollments[0].completed || 0
      },
      study: {
        totalSessions: sessions[0].total_sessions || 0,
        totalMinutes: sessions[0].total_minutes || 0,
        totalPoints: sessions[0].total_points || 0
      },
      flashcards: {
        total: flashcards[0].total || 0,
        due: flashcards[0].due || 0
      },
      quizzes: {
        totalAttempts: quizzes[0].total_attempts || 0,
        avgScore: quizzes[0].avg_score ? parseFloat(quizzes[0].avg_score).toFixed(2) : 0
      },
      recentActivity
    });
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get platform statistics (public)
router.get('/platform', async (req, res) => {
  try {
    // Get total active users (users who have logged in or have activity)
    const [users] = await db.query(`
      SELECT COUNT(*) as total FROM users
    `);

    // Get total published courses
    const [courses] = await db.query(`
      SELECT COUNT(*) as total FROM courses WHERE is_published = TRUE
    `);

    // Get total quiz questions answered (from quiz attempts)
    const [questions] = await db.query(`
      SELECT SUM(total_questions) as total FROM quiz_attempts
    `);

    // Calculate satisfaction rate (users who have completed at least one course or quiz)
    const [satisfaction] = await db.query(`
      SELECT 
        COUNT(DISTINCT CASE WHEN e.completed_at IS NOT NULL OR qa.id IS NOT NULL THEN u.id END) as satisfied,
        COUNT(DISTINCT u.id) as total_active
      FROM users u
      LEFT JOIN enrollments e ON u.id = e.user_id AND e.completed_at IS NOT NULL
      LEFT JOIN quiz_attempts qa ON u.id = qa.user_id
    `);

    const totalUsers = users[0].total || 0;
    const totalCourses = courses[0].total || 0;
    const totalQuestions = questions[0].total || 0;
    const satisfiedUsers = satisfaction[0].satisfied || 0;
    const totalActive = satisfaction[0].total_active || totalUsers || 1;
    const satisfactionRate = totalActive > 0 
      ? Math.min(100, Math.max(0, Math.round((satisfiedUsers / totalActive) * 100)))
      : 0;

    res.json({
      activeLearners: totalUsers,
      coursesAvailable: totalCourses,
      questionsAnswered: totalQuestions || 0,
      satisfactionRate: satisfactionRate
    });
  } catch (error) {
    console.error('Get platform stats error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get leaderboard
router.get('/leaderboard', async (req, res) => {
  try {
    const { limit = 50 } = req.query;

    // Get all users with their ranks using a subquery approach (compatible with older MySQL)
    const [rankedUsers] = await db.query(`
      SELECT 
        u.id,
        u.username,
        u.full_name,
        u.points,
        u.level,
        u.avatar_url,
        u.school,
        u.state,
        u.country,
        u.bio,
        @rank := @rank + 1 as rank_pos
      FROM users u
      CROSS JOIN (SELECT @rank := 0) r
      ORDER BY u.points DESC, u.level DESC
    `);

    // Update or insert into leaderboard
    for (const user of rankedUsers) {
      await db.query(`
        INSERT INTO leaderboard (user_id, username, points, level, rank_position)
        VALUES (?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          username = VALUES(username),
          points = VALUES(points),
          level = VALUES(level),
          rank_position = VALUES(rank_position)
      `, [user.id, user.username, user.points, user.level, user.rank_pos]);
    }

    // Get leaderboard with full user info
    const [leaderboardWithInfo] = await db.query(`
      SELECT 
        l.*,
        u.full_name,
        u.avatar_url,
        u.school,
        u.state,
        u.country,
        u.bio
      FROM leaderboard l
      JOIN users u ON l.user_id = u.id
      ORDER BY l.rank_position ASC
      LIMIT ?
    `, [parseInt(limit)]);

    res.json({ leaderboard: leaderboardWithInfo });
    return;

  } catch (error) {
    console.error('Get leaderboard error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;

