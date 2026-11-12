import { createId, type Audience, type LessonChunk } from './study-data';

type ApiLesson = Omit<LessonChunk, 'id' | 'source' | 'createdAt'>;

// All AI calls go to our own server (/api/...). The Groq key never reaches the browser.
async function post<T>(path: string, body: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error('Could not reach Study Pal. Check your internet connection.');
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof data?.error === 'string' ? data.error : 'Something went wrong. Please try again.');
  return data as T;
}

export async function generateLesson(topic: string, audience: Audience): Promise<LessonChunk> {
  const { lesson } = await post<{ lesson: ApiLesson }>('/api/generate', { topic, audience });
  return { ...lesson, audience, id: `ai-${createId()}`, source: 'ai', createdAt: new Date().toISOString() };
}

export async function askTutor(
  question: string,
  audience: Audience,
  lessons: LessonChunk[],
  history: { role: 'user' | 'assistant'; text: string }[],
): Promise<string> {
  const { answer } = await post<{ answer: string }>('/api/chat', {
    question,
    audience,
    lessons: lessons.map((lesson) => ({ title: lesson.title, text: lesson.text })),
    history,
  });
  return answer;
}
