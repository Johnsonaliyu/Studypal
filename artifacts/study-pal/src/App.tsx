import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import {
  ArrowDownToLine, ArrowLeft, ArrowRight, BookOpen, Check, CheckCircle2, ChevronRight,
  CircleHelp, CloudOff, Download, GraduationCap, HardDrive, Leaf, LoaderCircle, MessageCircle,
  Search, Send, Settings2, ShieldCheck, Sparkles, Wifi, WifiOff, X, Zap,
} from 'lucide-react';
import { lessons as defaultLessons, createId, type ChatMessage, type LessonChunk, type Progress, type QuizAttempt } from './study-data';
import { localStore } from './local-store';
import { retrieveLessons } from './retrieval';

type WorkerReply = { type: string; text?: string; progress?: number; backend?: string; model?: string; scope?: string };
type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };
const topics = ['All lessons', 'Biology', 'Mathematics', 'Physics', 'Chemistry', 'English'];

function App() {
  const [library, setLibrary] = useState<LessonChunk[]>([]);
  const [progress, setProgress] = useState<Progress[]>([]);
  const [attempts, setAttempts] = useState<QuizAttempt[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [topic, setTopic] = useState('All lessons');
  const [activeLesson, setActiveLesson] = useState<LessonChunk | null>(null);
  const [quizLesson, setQuizLesson] = useState<LessonChunk | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [storageError, setStorageError] = useState('');
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [persisted, setPersisted] = useState(false);
  const [syncEndpoint, setSyncEndpoint] = useState('');
  const [syncState, setSyncState] = useState<'local' | 'waiting' | 'syncing' | 'synced' | 'error'>('local');
  const [syncNotice, setSyncNotice] = useState('');
  const [installPrompt, setInstallPrompt] = useState<InstallPrompt | null>(null);
  const [toast, setToast] = useState('');
  const [backend, setBackend] = useState<'webgpu' | 'cpu'>('webgpu');
  const [model, setModel] = useState<'lite' | 'standard'>('lite');
  const [modelState, setModelState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [modelProgress, setModelProgress] = useState(0);
  const [modelStatus, setModelStatus] = useState('No local model prepared');
  const [loadedModel, setLoadedModel] = useState('');
  const [chatInput, setChatInput] = useState('');
  const [chatBusy, setChatBusy] = useState(false);
  const [chatError, setChatError] = useState('');
  const [quizIndex, setQuizIndex] = useState(0);
  const [quizAnswers, setQuizAnswers] = useState<number[]>([]);
  const [quizSubmitted, setQuizSubmitted] = useState(false);
  const workerRef = useRef<Worker | null>(null);
  const chatScroll = useRef<HTMLDivElement>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>();

  const notify = useCallback((text: string) => {
    setToast(text);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 3200);
  }, []);

  const refreshLocalData = useCallback(async () => {
    try {
      await localStore.seedLessons(defaultLessons);
      const [storedLessons, storedProgress, storedAttempts, storedMessages, endpoint, backendPreference, modelPreference, savedModel] = await Promise.all([
        localStore.getLessons(), localStore.getProgress(), localStore.getAttempts(), localStore.getMessages(),
        localStore.getSetting<string>('teacherEndpoint'), localStore.getSetting<'webgpu' | 'cpu'>('backend'),
        localStore.getSetting<'lite' | 'standard'>('model'), localStore.getSetting<string>('loadedModel'),
      ]);
      setLibrary(storedLessons.length ? storedLessons : defaultLessons);
      setProgress(storedProgress);
      setAttempts(storedAttempts);
      setMessages(storedMessages.sort((a, b) => a.id.localeCompare(b.id)).slice(-30));
      if (endpoint) setSyncEndpoint(endpoint);
      if (backendPreference) setBackend(backendPreference);
      if (modelPreference) setModel(modelPreference);
      if (savedModel) {
        setLoadedModel(savedModel);
        setModelStatus(`Saved on this device · prepare to load for this session · ${savedModel}`);
      }
      setStorageError('');
    } catch (error) {
      setStorageError(error instanceof Error ? error.message : 'Local storage could not be opened.');
      setLibrary(defaultLessons);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshLocalData();
    if ('storage' in navigator && navigator.storage?.persist) {
      void navigator.storage.persist().then(setPersisted).catch(() => setPersisted(false));
    }
    const online = () => setIsOnline(true);
    const offline = () => setIsOnline(false);
    const beforeInstall = (event: Event) => { event.preventDefault(); setInstallPrompt(event as InstallPrompt); };
    window.addEventListener('online', online);
    window.addEventListener('offline', offline);
    window.addEventListener('beforeinstallprompt', beforeInstall);
    return () => {
      window.removeEventListener('online', online);
      window.removeEventListener('offline', offline);
      window.removeEventListener('beforeinstallprompt', beforeInstall);
      workerRef.current?.terminate();
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, [refreshLocalData]);

  useEffect(() => {
    if (syncEndpoint.trim() && isOnline) setSyncState('waiting');
    else setSyncState('local');
  }, [isOnline, syncEndpoint]);

  useEffect(() => { if (chatScroll.current) chatScroll.current.scrollTop = chatScroll.current.scrollHeight; }, [messages]);

  const completeCount = progress.filter((item) => item.completed).length;
  const pendingCount = progress.filter((item) => item.completed).length;
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return library.filter((item) => (topic === 'All lessons' || item.topic === topic) &&
      (!q || `${item.topic} ${item.title} ${item.text} ${item.level}`.toLowerCase().includes(q)));
  }, [library, query, topic]);
  const lastAttempt = attempts.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const percentage = library.length ? Math.round(completeCount / library.length * 100) : 0;

  const saveProgress = async (lessonId: string) => {
    const item: Progress = { lessonId, completed: true, completedAt: new Date().toISOString() };
    try {
      await localStore.saveProgress(item);
      setProgress((items) => [...items.filter((entry) => entry.lessonId !== lessonId), item]);
      setSyncState(syncEndpoint && isOnline ? 'waiting' : 'local');
      setSyncNotice(syncEndpoint && isOnline ? 'Saved on this device. Waiting for your teacher connection.' : 'Saved on this device only. No teacher endpoint is configured.');
    } catch (error) {
      setStorageError(error instanceof Error ? error.message : 'Could not save progress locally.');
    }
  };

  const saveEndpoint = async (event: FormEvent) => {
    event.preventDefault();
    const endpoint = syncEndpoint.trim();
    if (endpoint) {
      try {
        const parsed = new URL(endpoint);
        if (!['https:', 'http:'].includes(parsed.protocol)) throw new Error('Use an http or https endpoint.');
        await localStore.saveSetting('teacherEndpoint', endpoint);
        setSyncNotice(isOnline ? 'Teacher endpoint saved. Your progress remains local until you choose to sync.' : 'Endpoint saved. Sync will wait until this device is online.');
        setSyncState(isOnline ? 'waiting' : 'local');
      } catch (error) {
        setSyncNotice(error instanceof Error ? error.message : 'Could not save this endpoint.');
      }
    } else {
      await localStore.saveSetting('teacherEndpoint', '');
      setSyncState('local');
      setSyncNotice('Teacher connection removed. Progress stays on this device.');
    }
  };

  const syncProgress = async () => {
    if (!isOnline) { setSyncNotice('You are offline. Progress is queued on this device.'); return; }
    if (!syncEndpoint.trim()) { setSyncNotice('No teacher endpoint is configured. Progress is local-only.'); return; }
    setSyncState('syncing');
    setSyncNotice('Sending queued progress to the configured teacher endpoint…');
    try {
      const response = await fetch(syncEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ progress, quizAttempts: attempts }),
        credentials: 'omit',
      });
      if (!response.ok) throw new Error(`Teacher endpoint returned ${response.status}.`);
      setSyncState('synced');
      setSyncNotice('The configured endpoint accepted this progress.');
    } catch (error) {
      setSyncState('error');
      setSyncNotice(error instanceof Error ? `Sync did not complete: ${error.message}` : 'Sync did not complete. Progress remains saved locally.');
    }
  };

  const setupModel = async () => {
    workerRef.current?.terminate();
    setModelState('loading');
    setModelProgress(0);
    setModelStatus(backend === 'webgpu' ? 'Checking WebGPU and preparing model…' : 'Preparing WASM CPU model…');
    try {
      await localStore.saveSetting('backend', backend);
      await localStore.saveSetting('model', model);
      const worker = new Worker(new URL('./inference.worker.ts', import.meta.url), { type: 'module' });
      workerRef.current = worker;
      worker.onerror = () => {
        setModelState('error');
        setModelStatus('The local model worker stopped unexpectedly. Try preparing the model again.');
        setChatBusy(false);
        setChatError('The local model worker stopped unexpectedly. Your lesson data remains safe.');
        setMessages((items) => items.filter((message) => message.id !== 'streaming'));
      };
      worker.onmessage = async (event: MessageEvent<WorkerReply>) => {
        const reply = event.data;
        if (reply.type === 'progress') {
          setModelProgress(reply.progress ?? 0);
          setModelStatus(reply.text ?? 'Preparing local model…');
        } else if (reply.type === 'ready') {
          const label = `${reply.model} · ${reply.backend}`;
          setLoadedModel(label);
          setModelState('ready');
          setModelStatus(`Ready on this device · ${label}`);
          await localStore.saveSetting('loadedModel', label);
          notify('Local model is ready on this device.');
        } else if (reply.type === 'error') {
          if (reply.scope === 'chat') {
            setChatBusy(false);
            setChatError(reply.text ?? 'Local answer could not be completed.');
            setMessages((items) => items.filter((message) => message.id !== 'streaming'));
          } else {
            setModelState('error');
            setModelStatus(reply.text ?? 'Model setup failed.');
            setLoadedModel('');
            await localStore.saveSetting('loadedModel', '');
          }
        } else if (reply.type === 'token') {
          setMessages((items) => items.map((message) => message.role === 'assistant' && message.id === 'streaming' ? { ...message, text: message.text + (reply.text ?? '') } : message));
        } else if (reply.type === 'done') {
          setChatBusy(false);
          setMessages((items) => {
            const updated = items.map((message) => message.id === 'streaming' ? { ...message, id: createId() } : message);
            const streamMessage = updated[updated.length - 1];
            if (streamMessage?.role === 'assistant') void localStore.saveMessage(streamMessage).catch(() => setStorageError('Could not save the chat answer locally.'));
            return updated;
          });
        }
      };
      worker.postMessage({ type: 'load', backend, model });
    } catch (error) {
      setModelState('error');
      setModelStatus(error instanceof Error ? error.message : 'Model setup failed.');
    }
  };

  const submitChat = async (questionText?: string) => {
    const question = (questionText ?? chatInput).trim();
    if (!question || chatBusy) return;
    setChatInput('');
    setChatError('');
    const retrieved = retrieveLessons(question, library, 3);
    const userMessage: ChatMessage = { id: createId(), role: 'user', text: question };
    try { await localStore.saveMessage(userMessage); } catch { setStorageError('Chat is shown, but could not be saved in local storage.'); }
    setMessages((items) => [...items, userMessage]);
    if (!retrieved.length) {
      const answer: ChatMessage = { id: createId(), role: 'assistant', text: 'I could not find that in the saved lessons. Try asking about photosynthesis, fractions, forces, atoms, ecosystems, or argument paragraphs.' };
      setMessages((items) => [...items, answer]);
      void localStore.saveMessage(answer).catch(() => undefined);
      return;
    }
    if (modelState !== 'ready' || !workerRef.current) {
      const response = `I found ${retrieved.length} relevant lesson${retrieved.length > 1 ? 's' : ''}, but there is no model running yet. Set up a local model first; I will not guess an answer.\n\nRelevant lessons: ${retrieved.map((item) => item.lesson.title).join('; ')}`;
      const answer: ChatMessage = { id: createId(), role: 'assistant', text: response, sources: retrieved.map((item) => item.lesson.title) };
      setMessages((items) => [...items, answer]);
      void localStore.saveMessage(answer).catch(() => undefined);
      return;
    }
    const sources = retrieved.map((item) => `${item.lesson.title} (${item.lesson.topic})`);
    const material = retrieved.map(({ lesson }) => `Lesson: ${lesson.title}\nTopic: ${lesson.topic}\n${lesson.text}\nExamples: ${lesson.examples.join(' ')}`).join('\n\n');
    const placeholder: ChatMessage = { id: 'streaming', role: 'assistant', text: '', sources };
    setMessages((items) => [...items, placeholder]);
    setChatBusy(true);
    workerRef.current.postMessage({
      type: 'answer',
      question,
      material,
      prompt: 'Answer only using this material, in simple English.',
    });
  };

  const openQuiz = (lesson: LessonChunk) => {
    setQuizLesson(lesson);
    setQuizIndex(0);
    setQuizAnswers([]);
    setQuizSubmitted(false);
  };

  const finishQuiz = async () => {
    if (!quizLesson) return;
    const score = quizLesson.questions.reduce((sum, question, index) => sum + (quizAnswers[index] === question.answer ? 1 : 0), 0);
    const attempt: QuizAttempt = { id: createId(), lessonId: quizLesson.id, score, total: quizLesson.questions.length, createdAt: new Date().toISOString() };
    try {
      await localStore.saveAttempt(attempt);
      setAttempts((items) => [...items, attempt]);
      setQuizSubmitted(true);
    } catch (error) {
      setStorageError(error instanceof Error ? error.message : 'Quiz result could not be saved.');
      setQuizSubmitted(true);
    }
  };

  const installApp = async () => {
    if (installPrompt) {
      await installPrompt.prompt();
      const result = await installPrompt.userChoice;
      if (result.outcome === 'accepted') notify('Study Pal is ready to install.');
      setInstallPrompt(null);
      return;
    }
    notify('To install, open your browser menu and choose “Install app” or “Add to Home Screen”.');
  };

  const clearChat = async () => {
    try {
      await localStore.clearMessages();
      setMessages([]);
      setChatError('');
      notify('Chat history cleared from this device.');
    } catch {
      setChatError('Chat history could not be cleared from local storage.');
    }
  };

  return (
    <div className="study-shell">
      <header className="topbar">
        <div className="brand"><span className="brand-mark"><BookOpen size={18} strokeWidth={2.2} /></span><span>study pal</span></div>
        <div className="top-actions">
          <span className="status-pill" title={isOnline ? 'Internet connection is available' : 'You are offline'}>
            {isOnline ? <Wifi size={13} /> : <WifiOff size={13} />}{isOnline ? 'Online' : 'Offline'}
          </span>
          <button className="icon-button" onClick={() => setSettingsOpen(true)} aria-label="Open study settings" title="Settings"><Settings2 size={17} /></button>
        </div>
      </header>
      <main className="page-wrap">
        <div className="welcome-line">A little learning, wherever you are</div>
        <h1 className="hero-title">Your study space, ready when you are.</h1>
        <p className="hero-subtitle">Lessons and progress stay right here on this device — even when the signal disappears.</p>

        <section className="hero-panel">
          <div className="hero-copy">
            <span className="eyebrow">A good place to begin</span>
            <h2>One small lesson is a good start.</h2>
            <p>Pick up where you left off, or follow a question that has been on your mind.</p>
          </div>
          <div className="hero-art" aria-hidden="true"><Sparkles className="hero-spark one" size={19} /><span className="book-shape"><Leaf size={32} strokeWidth={1.5} /></span><Sparkles className="hero-spark two" size={17} /></div>
        </section>

        <div className="main-grid">
          <section aria-labelledby="lessons-title">
            <div className="section-heading">
              <div><h2 id="lessons-title">Your lessons</h2><p>{library.length} saved for the days you need them</p></div>
              <span className="soft-pill"><HardDrive size={13} />On this device</span>
            </div>
            <label className="search-wrap">
              <Search size={17} />
              <input className="search-input" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a lesson or idea…" aria-label="Search saved lessons" />
            </label>
            <div className="filter-row" aria-label="Filter lessons by subject">
              {topics.map((item) => <button key={item} className={`filter-chip ${topic === item ? 'active' : ''}`} onClick={() => setTopic(item)}>{item}</button>)}
            </div>
            {storageError && <div className="empty-state" role="alert">Local storage needs attention: {storageError}</div>}
            {isLoading && <div className="lesson-list" aria-label="Loading saved lessons"><div className="lesson-skeleton" /><div className="lesson-skeleton" /><div className="lesson-skeleton" /></div>}
            {!isLoading && !storageError && !library.length && <div className="empty-state">Your saved lesson shelf is empty right now.</div>}
            <div className="lesson-list">
              {!isLoading && filtered.map((lesson, index) => {
                const done = progress.some((item) => item.lessonId === lesson.id && item.completed);
                const Icon = lesson.topic === 'Biology' ? Leaf : lesson.topic === 'Mathematics' ? Zap : lesson.topic === 'English' ? BookOpen : GraduationCap;
                return <button className="lesson-card" key={lesson.id} onClick={() => setActiveLesson(lesson)} style={{ animationDelay: `${index * 45}ms` }}>
                  <span className="subject-icon"><Icon size={19} /></span>
                  <span><span className="lesson-title">{lesson.title}</span><span className="lesson-meta">{lesson.topic}<span>·</span>{lesson.level}<span>·</span>{lesson.minutes} min {done && <><span>·</span><Check size={12} />Done</>}</span></span>
                  <ChevronRight className="lesson-arrow" size={18} />
                </button>;
              })}
              {!filtered.length && <div className="empty-state"><Search size={20} style={{ marginBottom: 8 }} /><div>No saved lessons match that search.</div><button className="secondary-button" style={{ margin: '12px auto 0' }} onClick={() => { setQuery(''); setTopic('All lessons'); }}>Show all lessons</button></div>}
            </div>
          </section>

          <aside className="side-stack" aria-label="Your study tools">
            <section className="side-card">
              <h3>Your progress</h3><p className="card-caption">A quiet record of what you have learned, saved only here.</p>
              <div className="progress-ring-row">
                <div className="progress-ring" style={{ '--progress': `${percentage}%` } as CSSProperties}><span>{percentage}%</span></div>
                <div><div className="progress-title">{completeCount ? 'Look how far you’ve come.' : 'Your first lesson awaits.'}</div><div className="progress-detail">{completeCount} of {library.length} lessons completed</div></div>
              </div>
              <div className="mini-stat"><span>Quiz attempts</span><strong>{attempts.length}</strong></div>
              <div className="mini-stat" style={{ marginTop: 0, borderTop: 0, paddingTop: 8 }}><span>Latest score</span><strong>{lastAttempt ? `${lastAttempt.score} / ${lastAttempt.total}` : 'Not yet'}</strong></div>
              <div className="mini-stat" style={{ marginTop: 0, borderTop: 0, paddingTop: 8 }}><span>Progress storage</span><strong>{pendingCount ? 'Local queue' : 'This device'}</strong></div>
            </section>

            <section className="model-card">
              <div className="model-top"><h3>Study chat, offline</h3><Sparkles size={16} color="#e6c59b" /></div>
              <p>{modelState === 'ready' ? 'Your downloaded model is ready. Answers are grounded in the saved lessons.' : 'Download a small model to ask lesson questions without mobile data.'}</p>
              <label className="sr-only" htmlFor="model-choice">Choose model size</label>
              <select id="model-choice" className="model-select" value={`${backend}:${model}`} onChange={async (event) => {
                const [nextBackend, nextModel] = event.target.value.split(':') as ['webgpu' | 'cpu', 'lite' | 'standard'];
                setBackend(nextBackend); setModel(nextModel);
                workerRef.current?.terminate();
                workerRef.current = null;
                setModelState('idle');
                setLoadedModel('');
                setModelStatus('Model choice changed. Prepare it for this session.');
                await localStore.saveSetting('loadedModel', '');
                await Promise.all([localStore.saveSetting('backend', nextBackend), localStore.saveSetting('model', nextModel)]);
              }}>
                <option value="webgpu:lite">Lite · WebGPU · Qwen2.5 0.5B</option>
                <option value="webgpu:standard">Standard · WebGPU · Qwen2.5 1.5B</option>
                <option value="cpu:lite">Lite · WASM CPU · Qwen2.5 0.5B</option>
                <option value="cpu:standard">Standard · WASM CPU · Qwen2.5 1.5B</option>
              </select>
              <button className="model-action" onClick={() => void setupModel()} disabled={modelState === 'loading'}>
                {modelState === 'loading' ? <><LoaderCircle size={14} className="spin" /> Preparing…</> : modelState === 'ready' && loadedModel ? 'Prepare again' : loadedModel ? 'Load saved model for this session' : <><Download size={14} /> Download to this device</>}
              </button>
              {modelState === 'loading' && <div className="model-progress"><span style={{ width: `${modelProgress}%` }} /></div>}
              <p className="model-foot">{modelStatus}{modelState === 'error' && <span role="alert"> Setup failed; try a supported browser or a smaller model.</span>}</p>
            </section>
          </aside>
        </div>

        <section className="chat-card" aria-label="Grounded study chat">
          <div className="chat-head"><div><h2>A question for Study Pal?</h2><p>Answers use saved lessons only. No lesson match means no made-up answer.</p></div><button className="icon-button" onClick={() => void clearChat()} aria-label="Clear chat history" title="Clear chat history"><X size={16} /></button></div>
          <div className="chat-body" ref={chatScroll} aria-live="polite">
            {!messages.length && <div className="chat-empty"><strong>Your chat stays on this device.</strong>Try a lesson question below. To get an AI answer, prepare a local model first; if no model is ready, Study Pal will say so clearly.</div>}
            {messages.map((message) => <div key={message.id}>
              <div className={`message ${message.role}`}>{message.text || (chatBusy && message.id === 'streaming' ? 'Thinking from your saved lessons…' : '')}</div>
              {message.sources?.length ? <div className="sources">{message.sources.map((source) => <span className="source-tag" key={source}>{source}</span>)}</div> : null}
            </div>)}
            {chatError && <p role="alert" style={{ color: '#a15d4d', fontSize: 12 }}>{chatError}</p>}
          </div>
          {!messages.length && <div className="prompt-row">{['Why do plants need light?', 'How do I add fractions?', 'What does a resultant force mean?'].map((prompt) => <button className="prompt-suggestion" key={prompt} onClick={() => void submitChat(prompt)}>{prompt}</button>)}</div>}
          <form className="chat-form" onSubmit={(event) => { event.preventDefault(); void submitChat(); }}>
            <input className="chat-input" value={chatInput} onChange={(event) => setChatInput(event.target.value)} placeholder="Ask about one of your lessons…" aria-label="Ask a question about your lessons" />
            <button className="send-button" type="submit" aria-label="Send question" disabled={!chatInput.trim() || chatBusy}><Send size={16} /></button>
          </form>
        </section>
        {!isOnline && <div className="footer-note"><CloudOff size={12} style={{ verticalAlign: 'middle', marginRight: 5 }} />Offline mode: lessons and progress remain available on this device.</div>}
        {isOnline && !syncEndpoint && <div className="footer-note">Progress is local-only. A teacher connection has not been configured.</div>}
      </main>

      {activeLesson && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setActiveLesson(null); }}>
        <article className="lesson-modal" role="dialog" aria-modal="true" aria-labelledby="lesson-heading">
          <div className="modal-head"><button className="secondary-button" onClick={() => setActiveLesson(null)}><ArrowLeft size={14} /> Back to lessons</button><span className="soft-pill">{activeLesson.topic} · {activeLesson.minutes} min</span></div>
          <div className="modal-body"><span className="eyebrow">{activeLesson.level} · Lesson</span><h1 id="lesson-heading">{activeLesson.title}</h1><div className="lesson-text">{activeLesson.text}</div>
            <div className="example-box"><strong>Try thinking about it this way</strong>{activeLesson.examples.map((example) => <p key={example} style={{ margin: '8px 0 0' }}>{example}</p>)}</div>
            <div className="modal-actions">
              <button className="secondary-button" onClick={() => { setActiveLesson(null); openQuiz(activeLesson); }}><CircleHelp size={15} />Quick quiz</button>
              <button className="primary-button" style={{ padding: '10px 15px' }} onClick={() => { void saveProgress(activeLesson.id); setActiveLesson(null); }}><CheckCircle2 size={15} />Mark lesson complete</button>
            </div>
          </div>
        </article>
      </div>}

      {quizLesson && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setQuizLesson(null); }}>
        <section className="lesson-modal" role="dialog" aria-modal="true" aria-labelledby="quiz-title">
          <div className="modal-head"><button className="secondary-button" onClick={() => setQuizLesson(null)}><ArrowLeft size={14} /> Close quiz</button><span className="soft-pill">Quick quiz · {quizIndex + 1}/{quizLesson.questions.length}</span></div>
          <div className="modal-body">
            {!quizSubmitted ? <>
              <span className="eyebrow">{quizLesson.topic} · Check what stuck</span>
              <h2 id="quiz-title" className="quiz-question">{quizLesson.questions[quizIndex].question}</h2>
              {quizLesson.questions[quizIndex].options.map((answer, index) => <button key={answer} className={`answer-option ${quizAnswers[quizIndex] === index ? 'selected' : ''}`} onClick={() => setQuizAnswers((items) => { const next = [...items]; next[quizIndex] = index; return next; })}><span className="answer-letter">{String.fromCharCode(65 + index)}</span>{answer}</button>)}
              <div className="modal-actions"><span style={{ color: '#829087', fontSize: 12, alignSelf: 'center' }}>Take your time. You can change your answer.</span>
                {quizIndex < quizLesson.questions.length - 1
                  ? <button className="primary-button" style={{ padding: '10px 15px' }} disabled={quizAnswers[quizIndex] === undefined} onClick={() => setQuizIndex((value) => value + 1)}>Next question <ArrowRight size={14} /></button>
                  : <button className="primary-button" style={{ padding: '10px 15px' }} disabled={quizAnswers[quizIndex] === undefined} onClick={() => void finishQuiz()}>See my results <Check size={14} /></button>}
              </div>
            </> : <QuizResult lesson={quizLesson} answers={quizAnswers} onClose={() => setQuizLesson(null)} />}
          </div>
        </section>
      </div>}

      {settingsOpen && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSettingsOpen(false); }}>
        <section className="lesson-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title">
          <div className="modal-head"><div style={{ display: 'flex', alignItems: 'center', gap: 9 }}><Settings2 size={17} /><strong id="settings-title">Your study settings</strong></div><button className="icon-button" onClick={() => setSettingsOpen(false)} aria-label="Close settings"><X size={16} /></button></div>
          <div className="modal-body">
            <div className="setting-row"><span className="subject-icon"><HardDrive size={17} /></span><div className="setting-copy"><strong>Stored on this device</strong><span>Lessons, chat, quizzes and progress are saved in IndexedDB. {persisted ? 'The browser granted persistent storage.' : 'Persistent storage was not confirmed; browser storage may be cleared by the device.'}</span></div><span className={`status-label ${persisted ? 'ok' : ''}`}>{persisted ? 'Protected' : 'Local'}</span></div>
            <div className="setting-row"><span className="subject-icon">{isOnline ? <Wifi size={17} /> : <WifiOff size={17} />}</span><div className="setting-copy"><strong>Connection</strong><span>{isOnline ? 'Online now. Lessons still work offline.' : 'Offline now. Your study tools remain available.'}</span></div><span className={`status-label ${isOnline ? 'ok' : ''}`}>{isOnline ? 'Online' : 'Offline'}</span></div>
            <div className="setting-row"><span className="subject-icon"><ShieldCheck size={17} /></span><div className="setting-copy"><strong>Progress sync</strong><span>{syncNotice || 'Progress is queued locally. Sync is only attempted when you are online and have configured a teacher endpoint.'}</span></div><span className={`status-label ${syncState === 'synced' ? 'ok' : ''}`}>{syncState === 'synced' ? 'Accepted' : syncState === 'waiting' ? 'Waiting' : syncState === 'syncing' ? 'Sending' : syncState === 'error' ? 'Failed' : 'Local-only'}</span></div>
            <form onSubmit={(event) => void saveEndpoint(event)} style={{ padding: '15px 0', borderBottom: '1px solid #eee9df' }}>
              <label className="setting-copy" htmlFor="teacher-endpoint"><strong>Teacher endpoint (optional)</strong><span>No endpoint is supplied by Study Pal. Add one only if your teacher gave you a sync URL.</span></label>
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}><input id="teacher-endpoint" className="chat-input" value={syncEndpoint} onChange={(event) => setSyncEndpoint(event.target.value)} placeholder="https://…" /><button className="secondary-button" type="submit">Save</button></div>
              <button className="primary-button" type="button" onClick={() => void syncProgress()} disabled={!isOnline || !syncEndpoint.trim() || syncState === 'syncing'} style={{ padding: '10px 13px', marginTop: 10 }}>{syncState === 'syncing' ? <LoaderCircle size={14} /> : <ArrowDownToLine size={14} />}Sync queued progress</button>
            </form>
            <div className="setting-row"><span className="subject-icon"><Download size={17} /></span><div className="setting-copy"><strong>Install Study Pal</strong><span>Add the app to your home screen for a more focused, offline-ready study space.</span></div><button className="secondary-button" onClick={() => void installApp()}>Install</button></div>
            <div className="setting-row"><span className="subject-icon"><MessageCircle size={17} /></span><div className="setting-copy"><strong>Local AI model</strong><span>{modelStatus}. Weights are downloaded by the browser, not included in the app.</span></div><span className={`status-label ${modelState === 'ready' ? 'ok' : ''}`}>{modelState === 'ready' ? 'Ready' : 'Not ready'}</span></div>
            <p className="footer-note" style={{ textAlign: 'left' }}>No account or teacher dashboard is connected. Nothing syncs unless you configure an endpoint and choose to send.</p>
          </div>
        </section>
      </div>}
      {toast && <div className="toast-line" role="status">{toast}</div>}
    </div>
  );
}

function QuizResult({ lesson, answers, onClose }: { lesson: LessonChunk; answers: number[]; onClose: () => void }) {
  const score = lesson.questions.reduce((sum, question, index) => sum + (answers[index] === question.answer ? 1 : 0), 0);
  return <div><span className="eyebrow">Quiz finished · Saved on this device</span><h2 id="quiz-title" className="quiz-question">{score === lesson.questions.length ? 'All yours.' : 'Good practice.'} You got {score} of {lesson.questions.length}.</h2>
    {lesson.questions.map((question, index) => <div key={question.question} className={`answer-option ${answers[index] === question.answer ? 'correct' : 'wrong'}`} style={{ display: 'block' }}><strong>{answers[index] === question.answer ? 'That’s right.' : `The answer is ${question.options[question.answer]}.`}</strong><div style={{ marginTop: 5, fontSize: 12 }}>{question.explanation}</div></div>)}
    <div className="modal-actions"><span style={{ color: '#829087', fontSize: 12, alignSelf: 'center' }}>Your result stays on this device.</span><button className="primary-button" style={{ padding: '10px 15px' }} onClick={onClose}>Back to lessons</button></div>
  </div>;
}

export default App;
