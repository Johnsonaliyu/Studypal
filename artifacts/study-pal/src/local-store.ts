import type { ChatMessage, LessonChunk, Progress, QuizAttempt } from './study-data';

const DB_NAME = 'study-pal-local';
const DB_VERSION = 1;

type StoreName = 'lessons' | 'progress' | 'attempts' | 'settings' | 'messages';
let database: Promise<IDBDatabase> | undefined;

function openDb() {
  if (!('indexedDB' in window)) return Promise.reject(new Error('This browser does not support local IndexedDB storage.'));
  if (!database) database = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('lessons')) db.createObjectStore('lessons', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('progress')) db.createObjectStore('progress', { keyPath: 'lessonId' });
      if (!db.objectStoreNames.contains('attempts')) db.createObjectStore('attempts', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings');
      if (!db.objectStoreNames.contains('messages')) db.createObjectStore('messages', { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Could not open local study storage.'));
  });
  return database;
}

async function request<T>(store: StoreName, action: (objectStore: IDBObjectStore) => IDBRequest<T>, mode: IDBTransactionMode = 'readonly'): Promise<T> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const req = action(tx.objectStore(store));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Could not access local study storage.'));
    tx.onabort = () => reject(tx.error ?? new Error('Local storage transaction failed.'));
  });
}

export const localStore = {
  async seedLessons(lessons: LessonChunk[]) {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('lessons', 'readwrite');
      const store = tx.objectStore('lessons');
      lessons.forEach((lesson) => store.put(lesson));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('Could not save the lesson library.'));
      tx.onabort = () => reject(tx.error ?? new Error('Lesson library save was interrupted.'));
    });
  },
  saveLesson: (lesson: LessonChunk) => request<IDBValidKey>('lessons', (store) => store.put(lesson), 'readwrite'),
  deleteLesson: (id: string) => request<undefined>('lessons', (store) => store.delete(id), 'readwrite'),
  getLessons: () => request<LessonChunk[]>('lessons', (store) => store.getAll()),
  getProgress: () => request<Progress[]>('progress', (store) => store.getAll()),
  getAttempts: () => request<QuizAttempt[]>('attempts', (store) => store.getAll()),
  saveProgress: (item: Progress) => request<IDBValidKey>('progress', (store) => store.put(item), 'readwrite'),
  saveAttempt: (item: QuizAttempt) => request<IDBValidKey>('attempts', (store) => store.put(item), 'readwrite'),
  getSetting: <T,>(key: string) => request<T | undefined>('settings', (store) => store.get(key)),
  saveSetting: (key: string, value: unknown) => request<IDBValidKey>('settings', (store) => store.put(value, key), 'readwrite'),
  getMessages: () => request<ChatMessage[]>('messages', (store) => store.getAll()),
  saveMessage: (message: ChatMessage) => request<IDBValidKey>('messages', (store) => store.put(message), 'readwrite'),
  clearMessages: async () => {
    await request<undefined>('messages', (store) => store.clear(), 'readwrite');
  },
};
    
