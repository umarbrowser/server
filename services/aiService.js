import OpenAI from 'openai';
import dotenv from 'dotenv';

dotenv.config();

// Check if API key is set
if (!process.env.OPENAI_API_KEY) {
  console.warn('⚠️  WARNING: OPENAI_API_KEY is not set in environment variables');
  console.warn('   AI features will not work. Please add OPENAI_API_KEY to your .env file');
}

const openai = process.env.OPENAI_API_KEY 
  ? new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    })
  : null;

/**
 * AI Study Assistant - Answers questions and provides explanations
 */
export async function getStudyAssistantResponse(userMessage, courseContext = null, conversationHistory = []) {
  try {
    if (!openai) {
      throw new Error('OpenAI API key is not configured. Please add OPENAI_API_KEY to your .env file.');
    }

    const systemPrompt = `You are an AI study assistant for an online learning platform. Your role is to:
1. Help students understand concepts clearly
2. Provide explanations in a friendly, encouraging manner
3. Break down complex topics into simpler parts
4. Ask clarifying questions when needed
5. Provide examples and analogies to aid understanding

${courseContext ? `Current course context: ${courseContext}` : ''}

Be concise but thorough. If you don't know something, admit it rather than guessing.`;

    const messages = [
      { role: 'system', content: systemPrompt },
      ...conversationHistory.slice(-10), // Keep last 10 messages for context
      { role: 'user', content: userMessage }
    ];

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini', // Using mini for cost efficiency, can upgrade to gpt-4
      messages: messages,
      temperature: 0.7,
      max_tokens: 500
    });

    return completion.choices[0].message.content;
  } catch (error) {
    console.error('OpenAI API Error:', error);
    if (error.message.includes('API key')) {
      throw new Error('OpenAI API key is not configured. Please check your .env file.');
    } else if (error.message.includes('rate limit') || error.message.includes('429')) {
      throw new Error('OpenAI API rate limit exceeded. Please try again later.');
    } else if (error.message.includes('insufficient_quota') || error.message.includes('401')) {
      throw new Error('OpenAI API key is invalid or has insufficient quota. Please check your API key and billing.');
    }
    throw new Error('AI service is temporarily unavailable. Please try again later.');
  }
}

/**
 * Generate course outline using AI
 */
export async function generateCourseOutline(topic, difficulty = 'beginner') {
  try {
    if (!openai) {
      throw new Error('OpenAI API key is not configured. Please add OPENAI_API_KEY to your .env file.');
    }

    if (!topic || topic.trim().length === 0) {
      throw new Error('Topic is required for course generation');
    }

    const prompt = `Create a comprehensive course outline for "${topic}" at ${difficulty} level.
Return a JSON object with a "modules" array, where each module has:
- title: Module title
- description: Brief description
- estimatedDuration: Duration in minutes
- keyPoints: Array of 3-5 key learning points

Format: {"modules": [{"title": "...", "description": "...", "estimatedDuration": 30, "keyPoints": ["...", "..."]}]}`;

    console.log(`Generating course outline for topic: ${topic}, difficulty: ${difficulty}`);

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You are an expert course designer. Return only valid JSON.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.7,
      response_format: { type: 'json_object' }
    });

    const content = completion.choices[0].message.content;
    console.log('OpenAI response received:', content.substring(0, 200));

    const response = JSON.parse(content);
    
    if (!response.modules || !Array.isArray(response.modules)) {
      console.error('Invalid response format:', response);
      throw new Error('Invalid response format from AI service');
    }

    return response.modules;
  } catch (error) {
    console.error('Course generation error:', error);
    
    if (error.message.includes('API key')) {
      throw new Error('OpenAI API key is not configured. Please check your .env file.');
    } else if (error.message.includes('rate limit') || error.message.includes('429')) {
      throw new Error('OpenAI API rate limit exceeded. Please try again later.');
    } else if (error.message.includes('insufficient_quota') || error.message.includes('401')) {
      throw new Error('OpenAI API key is invalid or has insufficient quota. Please check your API key and billing.');
    } else if (error.response) {
      throw new Error(`OpenAI API error: ${error.response.status} - ${error.response.statusText}`);
    } else {
      throw new Error(`Failed to generate course outline: ${error.message}`);
    }
  }
}

/**
 * Generate course content for a module
 */
export async function generateModuleContent(moduleTitle, description, keyPoints) {
  try {
    if (!openai) {
      throw new Error('OpenAI API key is not configured. Please add OPENAI_API_KEY to your .env file.');
    }

    const prompt = `Create comprehensive, detailed, and engaging educational content for a course module titled "${moduleTitle}".

Description: ${description}
Key Points to Cover: ${keyPoints.join(', ')}

Provide extensive, in-depth content (minimum 2000 words) that thoroughly covers:
1. Introduction to the Topic - A comprehensive overview that sets the context and importance
2. Detailed Explanations - Deep dive into concepts with multiple subsections covering:
   - Core concepts and definitions
   - How it works (step-by-step explanations)
   - Important principles and best practices
   - Common patterns and approaches
3. Examples and Use Cases - Multiple real-world examples with detailed explanations:
   - Practical examples
   - Code examples (if applicable)
   - Real-world scenarios
   - Case studies
4. Summary and Key Takeaways - Comprehensive summary with:
   - Main points recap
   - Important concepts to remember
   - Next steps and further learning

Format the content using Markdown with proper headings (##, ###), bullet points, code blocks (if applicable), and clear section breaks. Make it comprehensive, detailed, and suitable for serious learning. Include enough depth that a student can truly understand and master the topic.`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You are an expert educator and curriculum designer. Create comprehensive, detailed, and engaging educational content that is thorough and in-depth. Always provide extensive explanations with examples.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.7,
      max_tokens: 4000
    });

    return completion.choices[0].message.content;
  } catch (error) {
    console.error('Content generation error:', error);
    if (error.message.includes('API key')) {
      throw new Error('OpenAI API key is not configured. Please check your .env file.');
    }
    throw new Error(`Failed to generate module content: ${error.message}`);
  }
}

/**
 * Generate quiz questions for a topic
 */
export async function generateQuizQuestions(topic, difficulty = 'beginner', numQuestions = 5) {
  try {
    const prompt = `Generate ${numQuestions} quiz questions about "${topic}" at ${difficulty} level.
Return JSON format:
{
  "questions": [
    {
      "question": "Question text",
      "type": "multiple_choice",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correctAnswer": "Option A",
      "explanation": "Why this is correct"
    }
  ]
}`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You are an expert quiz creator. Return only valid JSON.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.8,
      response_format: { type: 'json_object' }
    });

    const response = JSON.parse(completion.choices[0].message.content);
    return response.questions || [];
  } catch (error) {
    console.error('Quiz generation error:', error);
    throw new Error('Failed to generate quiz questions');
  }
}

/**
 * Generate flashcards from course content
 */
export async function generateFlashcards(content, numCards = 5) {
  try {
    const prompt = `Generate ${numCards} flashcards from the following content. Each flashcard should have:
- Front: A question or key term
- Back: A clear, concise answer or definition

Content: ${content.substring(0, 2000)} // Limit content length

Return JSON:
{
  "flashcards": [
    {"front": "...", "back": "..."}
  ]
}`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You are an expert at creating educational flashcards. Return only valid JSON.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.7,
      response_format: { type: 'json_object' }
    });

    const response = JSON.parse(completion.choices[0].message.content);
    return response.flashcards || [];
  } catch (error) {
    console.error('Flashcard generation error:', error);
    throw new Error('Failed to generate flashcards');
  }
}

