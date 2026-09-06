/**
 * Universal Quiz System - AI Powered Features
 * API: Groq with openai120b model
 * File: api/groq.js
 */

const GROQ_API_KEY = 'GROQ_API_KEY_4';
const GROQ_BASE_URL = 'https://api.groq.com/openai/v1/chat/completions';
const DEFAULT_MODEL = 'openai/gpt-oss-120b'; // Change to 'qwen/qwen3.6-27b' if needed

class QuizAI {
    constructor(apiKey = GROQ_API_KEY, model = DEFAULT_MODEL) {
        this.apiKey = apiKey;
        this.model = model;
        this.cache = new Map();
        this.maxRetries = 3;
    }

    async callAPI(messages, options = {}) {
        const cacheKey = JSON.stringify({ messages, options, model: this.model });
        if (this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey);
        }

        const payload = {
            model: this.model,
            messages: messages,
            temperature: options.temperature || 0.7,
            max_tokens: options.maxTokens || 2048,
            top_p: options.topP || 1,
            stream: false
        };

        for (let attempt = 0; attempt < this.maxRetries; attempt++) {
            try {
                const response = await fetch(GROQ_BASE_URL, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${this.apiKey}`
                    },
                    body: JSON.stringify(payload)
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    throw new Error(`API Error ${response.status}: ${errorText}`);
                }

                const data = await response.json();
                const result = data.choices[0].message.content;
                this.cache.set(cacheKey, result);
                return result;

            } catch (error) {
                if (attempt === this.maxRetries - 1) {
                    console.error('Groq API Failed after retries:', error);
                    throw error;
                }
                await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
            }
        }
    }

    /**
     * AI-powered smart column layout suggestion
     * Analyzes questions and suggests single/dual column based on complexity
     */
    async suggestColumnLayout(questions) {
        const questionTexts = questions.map((q, i) => 
            `#${i + 1} | Q: ${q.question} | A: ${q.answer || 'N/A'} | Words: ${this.countWords(q.question + ' ' + (q.answer || ''))}`
        ).join('\n');

        const messages = [
            {
                role: 'system',
                content: `You are a PDF layout expert. Analyze each question and decide:
                - "dual": Short, simple questions (under 40 words total) - good for 2-column layout
                - "single": Long, complex questions (over 40 words) or those with images/tables - needs full width
                Respond ONLY with valid JSON array: [{"index": 0, "layout": "single"}, {"index": 1, "layout": "dual"}]`
            },
            {
                role: 'user',
                content: `Suggest column layout for these quiz questions:\n\n${questionTexts}`
            }
        ];

        try {
            const response = await this.callAPI(messages, { temperature: 0.2, maxTokens: 1024 });
            const cleaned = response.replace(/```json\n?|```\n?/g, '').trim();
            return JSON.parse(cleaned);
        } catch (e) {
            console.warn('AI layout suggestion failed:', e);
            return null;
        }
    }

    /**
     * Generate quiz questions using AI
     */
    async generateQuestions(topic, subject, className, count = 5, language = 'Bengali') {
        const messages = [
            {
                role: 'system',
                content: `You are an expert quiz creator for ${language} medium students. 
                Generate high-quality educational questions with clear, accurate answers.
                Respond ONLY with valid JSON: [{"question": "...", "answer": "..."}]`
            },
            {
                role: 'user',
                content: `Create ${count} quiz questions on "${topic}" from ${subject}, ${className}. 
                Include a mix of short (for dual column) and medium-length (for single column) questions.
                Questions should test understanding, not just memorization.`
            }
        ];

        try {
            const response = await this.callAPI(messages, { temperature: 0.7, maxTokens: 4096 });
            const cleaned = response.replace(/```json\n?|```\n?/g, '').trim();
            return JSON.parse(cleaned);
        } catch (e) {
            console.warn('AI question generation failed:', e);
            return [];
        }
    }

    /**
     * Summarize a topic/chapter
     */
    async generateSummary(topic, subject, className) {
        const messages = [
            {
                role: 'system',
                content: 'You are an expert educator. Create concise, clear summaries in Bengali.'
            },
            {
                role: 'user',
                content: `Write a brief summary (3-4 sentences) of "${topic}" from ${subject}, ${className}. 
                Highlight key concepts students should know.`
            }
        ];

        try {
            return await this.callAPI(messages, { temperature: 0.5, maxTokens: 512 });
        } catch (e) {
            return '';
        }
    }

    /**
     * Translate text between languages
     */
    async translate(text, targetLanguage = 'English') {
        const messages = [
            {
                role: 'system',
                content: `You are a professional translator. Translate to ${targetLanguage} while preserving meaning and formatting.`
            },
            { role: 'user', content: text }
        ];

        try {
            return await this.callAPI(messages, { temperature: 0.3 });
        } catch (e) {
            return text;
        }
    }

    /**
     * Explain why an answer is correct
     */
    async explainAnswer(question, studentAnswer, correctAnswer) {
        const messages = [
            {
                role: 'system',
                content: 'You are a helpful tutor. Explain the answer clearly in Bengali. Be encouraging.'
            },
            {
                role: 'user',
                content: `Question: ${question}\nStudent Answer: ${studentAnswer}\nCorrect Answer: ${correctAnswer}\n\nGive a brief, helpful explanation.`
            }
        ];

        try {
            return await this.callAPI(messages, { temperature: 0.5 });
        } catch (e) {
            return '';
        }
    }

    /**
     * Fix/improve question text
     */
    async fixQuestionText(question, answer) {
        const messages = [
            {
                role: 'system',
                content: 'You are a language expert. Fix grammar, clarity and formatting in Bengali educational content. Keep it simple and student-friendly. Return only the fixed text.'
            },
            {
                role: 'user',
                content: `Question: ${question}\nAnswer: ${answer}\n\nFix and improve both:`
            }
        ];

        try {
            const result = await this.callAPI(messages, { temperature: 0.4 });
            return result;
        } catch (e) {
            return question;
        }
    }

    countWords(text) {
        if (!text) return 0;
        return text.trim().split(/\s+/).filter(w => w.length > 0).length;
    }

    clearCache() {
        this.cache.clear();
    }

    setModel(model) {
        this.model = model;
        this.clearCache();
    }
}

// Global instance
window.QuizAI = QuizAI;
window.quizAI = new QuizAI();
