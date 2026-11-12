import type { LessonChunk } from './study-data';

const terms = (text: string) => text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
const stopWords = new Set(['a', 'an', 'and', 'are', 'as', 'at', 'be', 'do', 'does', 'for', 'from', 'how', 'i', 'in', 'is', 'it', 'of', 'on', 'or', 'that', 'the', 'to', 'what', 'when', 'where', 'which', 'who', 'why', 'with', 'you']);

export function retrieveLessons(query: string, lessons: LessonChunk[], limit = 3) {
  const queryTerms = [...new Set(terms(query).filter((term) => !stopWords.has(term)))];
  if (!queryTerms.length) return [];
  const docs = lessons.map((lesson) => {
    const content = `${lesson.topic} ${lesson.level} ${lesson.title} ${lesson.text} ${lesson.examples.join(' ')}`;
    return { lesson, words: terms(content), content };
  });
  const avgLength = docs.reduce((sum, item) => sum + item.words.length, 0) / Math.max(docs.length, 1);
  const scores = queryTerms.map((term) => {
    const count = docs.filter((doc) => doc.words.includes(term)).length;
    return [term, Math.log(1 + (docs.length - count + 0.5) / (count + 0.5))] as const;
  });
  return docs.map(({ lesson, words }) => {
    const frequencies = new Map<string, number>();
    words.forEach((word) => frequencies.set(word, (frequencies.get(word) ?? 0) + 1));
    const score = scores.reduce((sum, [term, idf]) => {
      const frequency = frequencies.get(term) ?? 0;
      return sum + idf * ((frequency * 2.2) / (frequency + 1.2 * (0.25 + 0.75 * words.length / (avgLength || 1))));
    }, 0);
    return { lesson, score };
  }).filter((item) => item.score > 0).sort((a, b) => b.score - a.score).slice(0, limit);
}
