import express from 'express';
import db from '../database/db.js';
import { authenticateToken, optionalAuth } from '../middleware/auth.js';
import { generateQuizQuestions } from '../services/aiService.js';

const router = express.Router();

// Get quizzes
router.get('/', optionalAuth, async (req, res) => {
  try {
    const { courseId } = req.query;

    let query = `
      SELECT q.*, c.title as course_title
      FROM quizzes q
      LEFT JOIN courses c ON q.course_id = c.id
      WHERE 1=1
    `;
    const params = [];

    if (courseId) {
      query += ' AND q.course_id = ?';
      params.push(courseId);
    }

    query += ' ORDER BY q.created_at DESC';

    const [quizzes] = await db.query(query, params);
    res.json({ quizzes });
  } catch (error) {
    console.error('Get quizzes error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get single quiz with questions
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const quizId = parseInt(req.params.id);

    const [quizzes] = await db.query('SELECT * FROM quizzes WHERE id = ?', [quizId]);
    if (quizzes.length === 0) {
      return res.status(404).json({ error: 'Quiz not found' });
    }

    const [questions] = await db.query(
      'SELECT id, question_text, question_type, options, points, order_index FROM quiz_questions WHERE quiz_id = ? ORDER BY order_index ASC',
      [quizId]
    );

    // Don't send correct answers to client
    const quiz = quizzes[0];
    quiz.questions = questions;

    res.json({ quiz });
  } catch (error) {
    console.error('Get quiz error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create quiz
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { title, description, course_id, time_limit_minutes } = req.body;

    if (!title) {
      return res.status(400).json({ error: 'Quiz title is required' });
    }

    const [result] = await db.query(
      'INSERT INTO quizzes (course_id, title, description, time_limit_minutes) VALUES (?, ?, ?, ?)',
      [course_id || null, title, description || null, time_limit_minutes || null]
    );

    const [quizzes] = await db.query('SELECT * FROM quizzes WHERE id = ?', [result.insertId]);
    res.status(201).json({ quiz: quizzes[0] });
  } catch (error) {
    console.error('Create quiz error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Generate quiz with AI
router.post('/generate', authenticateToken, async (req, res) => {
  try {
    const { topic, difficulty, numQuestions, courseId, timeLimit } = req.body;

    if (!topic) {
      return res.status(400).json({ error: 'Topic is required' });
    }

    const questions = await generateQuizQuestions(topic, difficulty || 'beginner', numQuestions || 5);

    // Create quiz
    const [quizResult] = await db.query(
      'INSERT INTO quizzes (course_id, title, description, time_limit_minutes, total_questions) VALUES (?, ?, ?, ?, ?)',
      [courseId || null, `Quiz: ${topic}`, `AI-generated quiz about ${topic}`, timeLimit || null, questions.length]
    );

    const quizId = quizResult.insertId;

    // Add questions
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      await db.query(
        'INSERT INTO quiz_questions (quiz_id, question_text, question_type, options, correct_answer, points, order_index) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [
          quizId,
          q.question,
          q.type || 'multiple_choice',
          JSON.stringify(q.options || []),
          q.correctAnswer,
          q.points || 1,
          i + 1
        ]
      );
    }

    const [quizzes] = await db.query('SELECT * FROM quizzes WHERE id = ?', [quizId]);
    res.status(201).json({ quiz: quizzes[0] });
  } catch (error) {
    console.error('Generate quiz error:', error);
    res.status(500).json({ error: error.message || 'Failed to generate quiz' });
  }
});

// Submit quiz attempt
router.post('/:id/submit', authenticateToken, async (req, res) => {
  try {
    const quizId = parseInt(req.params.id);
    const { answers, timeTakenSeconds } = req.body;

    // Get quiz with correct answers
    const [quizzes] = await db.query('SELECT * FROM quizzes WHERE id = ?', [quizId]);
    if (quizzes.length === 0) {
      return res.status(404).json({ error: 'Quiz not found' });
    }

    const [questions] = await db.query(
      'SELECT id, correct_answer, points FROM quiz_questions WHERE quiz_id = ? ORDER BY order_index ASC',
      [quizId]
    );

    // Grade quiz
    let correctAnswers = 0;
    let totalPoints = 0;
    let earnedPoints = 0;

    const results = questions.map((q, index) => {
      totalPoints += q.points;
      const userAnswer = answers[index];
      const isCorrect = userAnswer && userAnswer.toString().toLowerCase().trim() === q.correct_answer.toString().toLowerCase().trim();
      
      if (isCorrect) {
        correctAnswers++;
        earnedPoints += q.points;
      }

      return {
        questionId: q.id,
        correct: isCorrect,
        correctAnswer: q.correct_answer,
        userAnswer: userAnswer
      };
    });

    const score = totalPoints > 0 ? (earnedPoints / totalPoints) * 100 : 0;

    // Save attempt
    await db.query(
      'INSERT INTO quiz_attempts (user_id, quiz_id, score, total_questions, correct_answers, time_taken_seconds) VALUES (?, ?, ?, ?, ?, ?)',
      [req.user.userId, quizId, score, questions.length, correctAnswers, timeTakenSeconds || 0]
    );

    // Award points based on score
    const pointsEarned = Math.floor(score / 10); // 10 points per 10% score
    await db.query('UPDATE users SET points = points + ? WHERE id = ?', [pointsEarned, req.user.userId]);

    // Record study session
    await db.query(
      'INSERT INTO study_sessions (user_id, course_id, session_type, duration_minutes, points_earned) VALUES (?, ?, ?, ?, ?)',
      [req.user.userId, quizzes[0].course_id, 'quiz', Math.ceil((timeTakenSeconds || 0) / 60), pointsEarned]
    );

    res.json({
      score: score.toFixed(2),
      correctAnswers,
      totalQuestions: questions.length,
      earnedPoints,
      totalPoints,
      results
    });
  } catch (error) {
    console.error('Submit quiz error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get user's quiz attempts
router.get('/user/attempts', authenticateToken, async (req, res) => {
  try {
    const [attempts] = await db.query(
      `SELECT 
        qa.*,
        q.title as quiz_title,
        c.title as course_title
      FROM quiz_attempts qa
      JOIN quizzes q ON qa.quiz_id = q.id
      LEFT JOIN courses c ON q.course_id = c.id
      WHERE qa.user_id = ?
      ORDER BY qa.completed_at DESC`,
      [req.user.userId]
    );

    res.json({ attempts });
  } catch (error) {
    console.error('Get attempts error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete quiz
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const quizId = parseInt(req.params.id);

    // Check if quiz exists and user has permission (instructor of course or admin)
    const [quizzes] = await db.query(
      `SELECT q.*, c.instructor_id 
       FROM quizzes q 
       LEFT JOIN courses c ON q.course_id = c.id 
       WHERE q.id = ?`,
      [quizId]
    );

    if (quizzes.length === 0) {
      return res.status(404).json({ error: 'Quiz not found' });
    }

    const quiz = quizzes[0];
    
    // Allow deletion if user is instructor of the course or if quiz has no course
    if (quiz.course_id && quiz.instructor_id !== req.user.userId) {
      return res.status(403).json({ error: 'Not authorized to delete this quiz' });
    }

    // Delete quiz (cascade will handle questions and attempts)
    await db.query('DELETE FROM quizzes WHERE id = ?', [quizId]);

    res.json({ message: 'Quiz deleted successfully' });
  } catch (error) {
    console.error('Delete quiz error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;

