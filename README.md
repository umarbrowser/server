# EduAI Platform - Backend Server

AI-powered learning platform backend with Express.js, MySQL, and OpenAI integration.

## Features

- 🔐 JWT Authentication (Register/Login)
- 📚 Course Management (Create, Enroll, Progress Tracking)
- 🤖 AI Study Assistant (24/7 chat support)
- 🎯 AI-Powered Course Generation
- 📝 Flashcards with Spaced Repetition
- 📊 Quiz/Exam Practice Mode
- 🏆 Gamification (Points, Levels, Leaderboards)
- 📈 Progress Tracking & Analytics

## Quick Start

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure environment:**
   ```bash
   cp .env.example .env
   ```
   Edit `.env` with your configuration:
   - MySQL database credentials
   - JWT secret key
   - OpenAI API key (get from https://platform.openai.com/api-keys)

3. **Set up database:**
   ```bash
   npm run setup
   ```
   Or manually:
   ```bash
   mysql -u root -p < database/schema.sql
   ```

4. **Start server:**
   ```bash
   npm start
   ```
   Or for development with auto-reload:
   ```bash
   npm run dev
   ```

## Environment Variables

- `DB_HOST` - MySQL host (default: localhost)
- `DB_USER` - MySQL username (default: root)
- `DB_PASSWORD` - MySQL password
- `DB_NAME` - Database name (default: eduai_platform)
- `DB_PORT` - MySQL port (default: 3306)
- `JWT_SECRET` - Secret key for JWT tokens
- `PORT` - Server port (default: 5000)
- `OPENAI_API_KEY` - Your OpenAI API key (required for AI features)
- `FRONTEND_URL` - Frontend URL for CORS (default: http://localhost:5173)

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user
- `GET /api/auth/me` - Get current user (requires token)

### Courses
- `GET /api/courses` - Get all published courses
- `GET /api/courses/:id` - Get single course with modules
- `POST /api/courses` - Create course (instructor)
- `POST /api/courses/generate-outline` - Generate course outline with AI
- `POST /api/courses/:id/modules` - Add module to course
- `POST /api/courses/:id/modules/generate` - Generate module content with AI
- `POST /api/courses/:id/enroll` - Enroll in course
- `PUT /api/courses/:id/progress` - Update course progress
- `GET /api/courses/user/my-courses` - Get user's enrolled courses

### AI Assistant
- `GET /api/ai/conversations` - Get user's conversations
- `POST /api/ai/conversations` - Create new conversation
- `GET /api/ai/conversations/:id/messages` - Get conversation messages
- `POST /api/ai/conversations/:id/messages` - Send message to AI assistant

### Flashcards
- `GET /api/flashcards` - Get user's flashcards
- `POST /api/flashcards` - Create flashcard
- `POST /api/flashcards/generate` - Generate flashcards from content (AI)
- `POST /api/flashcards/:id/review` - Review flashcard (spaced repetition)
- `DELETE /api/flashcards/:id` - Delete flashcard

### Quizzes
- `GET /api/quizzes` - Get quizzes
- `GET /api/quizzes/:id` - Get quiz with questions
- `POST /api/quizzes` - Create quiz
- `POST /api/quizzes/generate` - Generate quiz with AI
- `POST /api/quizzes/:id/submit` - Submit quiz attempt
- `GET /api/quizzes/user/attempts` - Get user's quiz attempts

### Statistics
- `GET /api/stats/user` - Get user statistics
- `GET /api/stats/leaderboard` - Get leaderboard

## Security

- Passwords hashed with bcryptjs
- JWT tokens for authentication
- SQL injection protection via parameterized queries
- CORS enabled for frontend
- Rate limiting on API routes

## AI Features

The platform uses OpenAI's GPT models for:
- Study assistant chat
- Course outline generation
- Course content generation
- Quiz question generation
- Flashcard generation

Make sure to set your `OPENAI_API_KEY` in the `.env` file.

