import express from 'express';
import db from '../database/db.js';
import { authenticateToken } from '../middleware/auth.js';
import { getStudyAssistantResponse } from '../services/aiService.js';

const router = express.Router();

// Get or create conversation
router.get('/conversations', authenticateToken, async (req, res) => {
  try {
    const { courseId } = req.query;

    let query = 'SELECT * FROM ai_conversations WHERE user_id = $1';
    const params = [req.user.userId];

    if (courseId) {
      query += ' AND course_id = $2';
      params.push(courseId);
    }

    query += ' ORDER BY updated_at DESC';

    const [conversations] = await db.query(query, params);
    res.json({ conversations });
  } catch (error) {
    console.error('Get conversations error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create new conversation
router.post('/conversations', authenticateToken, async (req, res) => {
  try {
    const { title, courseId } = req.body;

    const [result] = await db.query(
      'INSERT INTO ai_conversations (user_id, course_id, title) VALUES ($1, $2, $3) RETURNING id',
      [req.user.userId, courseId || null, title || 'New Conversation']
    );

    const conversationId = result[0].id;
    const [conversations] = await db.query('SELECT * FROM ai_conversations WHERE id = $1', [conversationId]);
    res.status(201).json({ conversation: conversations[0] });
  } catch (error) {
    console.error('Create conversation error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get messages for a conversation
router.get('/conversations/:id/messages', authenticateToken, async (req, res) => {
  try {
    const conversationId = parseInt(req.params.id);

    // Verify ownership
    const [conversations] = await db.query(
      'SELECT * FROM ai_conversations WHERE id = $1 AND user_id = $2',
      [conversationId, req.user.userId]
    );

    if (conversations.length === 0) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    const [messages] = await db.query(
      'SELECT * FROM ai_messages WHERE conversation_id = $1 ORDER BY created_at ASC',
      [conversationId]
    );

    res.json({ messages });
  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Send message to AI assistant
router.post('/conversations/:id/messages', authenticateToken, async (req, res) => {
  try {
    const conversationId = parseInt(req.params.id);
    const { content } = req.body;

    if (!content) {
      return res.status(400).json({ error: 'Message content is required' });
    }

    // Verify ownership and get conversation
    const [conversations] = await db.query(
      'SELECT * FROM ai_conversations WHERE id = $1 AND user_id = $2',
      [conversationId, req.user.userId]
    );

    if (conversations.length === 0) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    const conversation = conversations[0];

    // Get course context if available
    let courseContext = null;
    if (conversation.course_id) {
      const [courses] = await db.query('SELECT title FROM courses WHERE id = $1', [conversation.course_id]);
      if (courses.length > 0) {
        courseContext = courses[0].title;
      }
    }

    // Get conversation history
    const [historyMessages] = await db.query(
      'SELECT role, content FROM ai_messages WHERE conversation_id = $1 ORDER BY created_at ASC',
      [conversationId]
    );

    const conversationHistory = historyMessages.map(msg => ({
      role: msg.role,
      content: msg.content
    }));

    // Save user message
    await db.query(
      'INSERT INTO ai_messages (conversation_id, role, content) VALUES ($1, $2, $3)',
      [conversationId, 'user', content]
    );

    // Get AI response
    const aiResponse = await getStudyAssistantResponse(content, courseContext, conversationHistory);

    // Save AI response
    await db.query(
      'INSERT INTO ai_messages (conversation_id, role, content) VALUES ($1, $2, $3)',
      [conversationId, 'assistant', aiResponse]
    );

    // Update conversation timestamp
    await db.query(
      'UPDATE ai_conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = $1',
      [conversationId]
    );

    // Award points for using AI assistant
    await db.query('UPDATE users SET points = points + 1 WHERE id = $1', [req.user.userId]);

    res.json({
      userMessage: { role: 'user', content },
      aiMessage: { role: 'assistant', content: aiResponse }
    });
  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({ error: error.message || 'Server error' });
  }
});

// Delete conversation
router.delete('/conversations/:id', authenticateToken, async (req, res) => {
  try {
    const conversationId = parseInt(req.params.id);

    // Verify ownership
    const [conversations] = await db.query(
      'SELECT * FROM ai_conversations WHERE id = $1 AND user_id = $2',
      [conversationId, req.user.userId]
    );

    if (conversations.length === 0) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    // Delete conversation (cascade will handle messages)
    await db.query('DELETE FROM ai_conversations WHERE id = $1', [conversationId]);

    res.json({ message: 'Conversation deleted successfully' });
  } catch (error) {
    console.error('Delete conversation error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
