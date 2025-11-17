import express from 'express';
import db from '../database/db.js';
import { authenticateToken } from '../middleware/auth.js';
import { generateFlashcards } from '../services/aiService.js';

const router = express.Router();

// Get user's flashcards
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { courseId, due } = req.query;

    let query = 'SELECT * FROM flashcards WHERE user_id = ?';
    const params = [req.user.userId];

    if (courseId) {
      query += ' AND course_id = ?';
      params.push(courseId);
    }

    if (due === 'true') {
      query += ' AND (next_review IS NULL OR next_review <= NOW())';
    }

    query += ' ORDER BY next_review ASC, created_at DESC';

    const [flashcards] = await db.query(query, params);
    res.json({ flashcards });
  } catch (error) {
    console.error('Get flashcards error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create flashcard
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { front_text, back_text, course_id } = req.body;

    if (!front_text || !back_text) {
      return res.status(400).json({ error: 'Front and back text are required' });
    }

    const [result] = await db.query(
      'INSERT INTO flashcards (user_id, course_id, front_text, back_text, next_review) VALUES (?, ?, ?, ?, NOW())',
      [req.user.userId, course_id || null, front_text, back_text]
    );

    const [flashcards] = await db.query('SELECT * FROM flashcards WHERE id = ?', [result.insertId]);
    res.status(201).json({ flashcard: flashcards[0] });
  } catch (error) {
    console.error('Create flashcard error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Generate flashcards from content (AI)
router.post('/generate', authenticateToken, async (req, res) => {
  try {
    const { content, numCards, courseId } = req.body;

    if (!content) {
      return res.status(400).json({ error: 'Content is required' });
    }

    const flashcards = await generateFlashcards(content, numCards || 5);

    // Save generated flashcards
    const savedFlashcards = [];
    for (const card of flashcards) {
      const [result] = await db.query(
        'INSERT INTO flashcards (user_id, course_id, front_text, back_text, next_review) VALUES (?, ?, ?, ?, NOW())',
        [req.user.userId, courseId || null, card.front, card.back]
      );
      const [newCards] = await db.query('SELECT * FROM flashcards WHERE id = ?', [result.insertId]);
      savedFlashcards.push(newCards[0]);
    }

    res.json({ flashcards: savedFlashcards });
  } catch (error) {
    console.error('Generate flashcards error:', error);
    res.status(500).json({ error: error.message || 'Failed to generate flashcards' });
  }
});

// Review flashcard (spaced repetition)
router.post('/:id/review', authenticateToken, async (req, res) => {
  try {
    const flashcardId = parseInt(req.params.id);
    const { difficulty } = req.body; // 1=easy, 2=medium, 3=hard, 4=again

    // Get flashcard
    const [flashcards] = await db.query(
      'SELECT * FROM flashcards WHERE id = ? AND user_id = ?',
      [flashcardId, req.user.userId]
    );

    if (flashcards.length === 0) {
      return res.status(404).json({ error: 'Flashcard not found' });
    }

    const flashcard = flashcards[0];

    // Calculate next review using spaced repetition algorithm
    const now = new Date();
    const reviewCount = flashcard.review_count + 1;
    let difficultyLevel = flashcard.difficulty_level;
    let intervalDays = 1;

    // Update difficulty based on performance
    if (difficulty === 1) { // Easy
      difficultyLevel = Math.max(1, difficultyLevel - 0.2);
      intervalDays = Math.ceil(flashcard.difficulty_level * 2.5);
    } else if (difficulty === 2) { // Medium
      difficultyLevel = flashcard.difficulty_level;
      intervalDays = Math.ceil(flashcard.difficulty_level * 1.5);
    } else if (difficulty === 3) { // Hard
      difficultyLevel = Math.min(5, difficultyLevel + 0.3);
      intervalDays = Math.ceil(flashcard.difficulty_level * 0.8);
    } else { // Again
      difficultyLevel = Math.min(5, difficultyLevel + 0.5);
      intervalDays = 1;
    }

    const nextReview = new Date(now);
    nextReview.setDate(nextReview.getDate() + intervalDays);

    // Update flashcard
    await db.query(
      'UPDATE flashcards SET difficulty_level = ?, review_count = ?, last_reviewed = NOW(), next_review = ? WHERE id = ?',
      [difficultyLevel, reviewCount, nextReview, flashcardId]
    );

    // Award points
    const pointsEarned = difficulty === 1 ? 3 : difficulty === 2 ? 2 : 1;
    await db.query('UPDATE users SET points = points + ? WHERE id = ?', [pointsEarned, req.user.userId]);

    res.json({
      message: 'Review recorded',
      nextReview: nextReview,
      difficultyLevel: difficultyLevel
    });
  } catch (error) {
    console.error('Review flashcard error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update flashcard
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const flashcardId = parseInt(req.params.id);
    const { front_text, back_text } = req.body;

    if (!front_text || !back_text) {
      return res.status(400).json({ error: 'Front and back text are required' });
    }

    // Verify ownership
    const [flashcards] = await db.query(
      'SELECT * FROM flashcards WHERE id = ? AND user_id = ?',
      [flashcardId, req.user.userId]
    );

    if (flashcards.length === 0) {
      return res.status(404).json({ error: 'Flashcard not found' });
    }

    // Update flashcard
    await db.query(
      'UPDATE flashcards SET front_text = ?, back_text = ? WHERE id = ?',
      [front_text, back_text, flashcardId]
    );

    const [updated] = await db.query('SELECT * FROM flashcards WHERE id = ?', [flashcardId]);
    res.json({ flashcard: updated[0] });
  } catch (error) {
    console.error('Update flashcard error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete flashcard
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const flashcardId = parseInt(req.params.id);

    await db.query('DELETE FROM flashcards WHERE id = ? AND user_id = ?', [flashcardId, req.user.userId]);
    res.json({ message: 'Flashcard deleted' });
  } catch (error) {
    console.error('Delete flashcard error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;

