/// <reference lib="webworker" />
type WorkerRequest =
  | { type: 'load'; backend: 'webgpu' | 'cpu'; model: 'lite' | 'standard' }
  | { type: 'answer'; prompt: string; material: string; question: string }
  | { type: 'stop' }
  | { type: 'unload' };

const ctx: DedicatedWorkerGlobalScope = self as DedicatedWorkerGlobalScope;
let engine: any;
let backendInUse = '';
let aborted = false;

const webGpuModels: Record<string, string> = {
  lite: 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC',
  standard: 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC',
};
// Phones without the WebGPU "shader-f16" feature cannot run the q4f16 builds, so use the q4f32 builds there.
const webGpuModelsF32: Record<string, string> = {
  lite: 'Qwen2.5-0.5B-Instruct-q4f32_1-MLC',
  standard: 'Qwen2.5-1.5B-Instruct-q4f32_1-MLC',
};
const FIRST_TOKEN_TIMEOUT_MS = 60_000;
const withTimeout = <T,>(promise: Promise<T>, ms: number, message: string): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then((value) => { clearTimeout(timer); resolve(value); }, (error) => { clearTimeout(timer); reject(error); });
  });
const cpuModels = {
  lite: { repo: 'bartowski/Qwen2.5-0.5B-Instruct-GGUF', file: 'Qwen2.5-0.5B-Instruct-Q4_K_M.gguf' },
  standard: { repo: 'bartowski/Qwen2.5-1.5B-Instruct-GGUF', file: 'Qwen2.5-1.5B-Instruct-Q4_K_M.gguf' },
};

// Keep a reference so the browser cannot garbage-collect the WebGPU adapter while the model is running.
let gpuAdapterRef: unknown;

const friendlyGpuError = (error: unknown): string => {
  const message = error instanceof Error ? error.message : String(error);
  if (/Instance reference|mapAsync|device.*lost|DeviceLost|out of memory/i.test(message)) return 'the phone graphics chip stopped responding';
  return message.slice(0, 120);
};

async function loadWebGpu(model: 'lite' | 'standard') {
  const webllm = await import('@mlc-ai/web-llm');
  const list = (webllm.prebuiltAppConfig as any)?.model_list as Array<{ model_id: string }> | undefined;
  const adapter = await (navigator as any).gpu.requestAdapter();
  if (!adapter) throw new Error('No WebGPU graphics adapter was found on this device.');
  gpuAdapterRef = adapter;
  const hasF16 = adapter.features?.has?.('shader-f16') ?? false;
  let modelId = hasF16 ? webGpuModels[model] : webGpuModelsF32[model];
  if (list && !list.some((item) => item.model_id === modelId)) {
    const alternative = hasF16 ? webGpuModelsF32[model] : webGpuModels[model];
    if (list.some((item) => item.model_id === alternative)) modelId = alternative;
    else throw new Error(`The installed WebLLM registry does not include ${modelId}.`);
  }
  engine = await webllm.CreateMLCEngine(modelId, {
    initProgressCallback: (progress: { progress?: number; text?: string }) => ctx.postMessage({ type: 'progress', progress: Math.round((progress.progress ?? 0) * 100), text: progress.text ?? 'Preparing WebGPU model…' }),
  });
  // Prove the model can really generate before telling the student it is ready.
  ctx.postMessage({ type: 'progress', progress: 100, text: 'Testing the model…' });
  await withTimeout(
    engine.chat.completions.create({ messages: [{ role: 'user', content: 'Say hi.' }], max_tokens: 4, temperature: 0 }),
    FIRST_TOKEN_TIMEOUT_MS,
    'The model downloaded but could not generate text on this device.',
  );
  backendInUse = 'WebGPU';
  ctx.postMessage({ type: 'ready', backend: backendInUse, model: modelId });
}

async function loadModel(request: Extract<WorkerRequest, { type: 'load' }>) {
  engine = undefined;
  backendInUse = '';
  aborted = false;
  const selectedBackend = request.backend === 'webgpu' && !('gpu' in navigator) ? 'cpu' : request.backend;
  if (request.backend === 'webgpu' && selectedBackend === 'cpu') {
    ctx.postMessage({ type: 'progress', progress: 0, text: 'WebGPU is unavailable here. Falling back to the WASM CPU model…' });
  }
  if (selectedBackend === 'webgpu') {
    try {
      await loadWebGpu(request.model);
      return;
    } catch (error) {
      // Phone GPUs often fail here (device lost, out of memory...). Fall back to the CPU model instead of giving up.
      try { await engine?.unload?.(); } catch { /* ignore */ }
      engine = undefined;
      backendInUse = '';
      console.error('WebGPU model failed, falling back to CPU', error);
      ctx.postMessage({ type: 'progress', progress: 0, text: `WebGPU did not work on this device (${friendlyGpuError(error)}). Switching to the CPU model…` });
    }
  }
  try {
    const { Wllama } = await import('@wllama/wllama');
    // wllama does not ship ready-made paths: the app must tell it where the .wasm file is. Vite turns "?url" into a hashed asset URL.
    const wasmUrl = (await import('@wllama/wllama/esm/wasm/wllama.wasm?url')).default;
    engine = new Wllama({ default: wasmUrl });
    const cpuModel = cpuModels[request.model];
    await engine.loadModelFromHF(cpuModel, {
      n_gpu_layers: 0,
      progressCallback: (event: { loaded?: number; total?: number }) => {
        const progress = event.total ? Math.round((event.loaded ?? 0) / event.total * 100) : 0;
        ctx.postMessage({ type: 'progress', progress, text: 'Downloading CPU model…' });
      },
    });
    backendInUse = 'WASM CPU';
    ctx.postMessage({ type: 'ready', backend: backendInUse, model: `${cpuModel.repo}/${cpuModel.file}` });
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : 'wllama CPU model could not be loaded. Check the connection and available storage.');
  }
}

async function answer(question: string, material: string, prefix: string) {
  if (!engine) throw new Error('Choose and prepare a local model before asking the study chat.');
  aborted = false;
  // If nothing arrives for a while, stop generating and tell the student instead of spinning forever.
  let gotToken = false;
  const watchdog = setTimeout(() => {
    if (gotToken) return;
    aborted = true;
    try { engine?.interruptGenerate?.(); } catch { /* ignore */ }
    ctx.postMessage({ type: 'error', scope: 'chat', text: 'The offline model took too long to start answering on this device.' });
  }, FIRST_TOKEN_TIMEOUT_MS);
  try {
    await generate(question, material, prefix, () => { gotToken = true; clearTimeout(watchdog); });
  } finally { clearTimeout(watchdog); }
}

async function generate(question: string, material: string, prefix: string, onToken: () => void) {
  const prompt = `${prefix}\n\n${material}\n\nQuestion: ${question}`;
  if (backendInUse === 'WebGPU') {
    const response = await engine.chat.completions.create({
      messages: [
        { role: 'system', content: 'Answer only using this material, in simple English. If the material does not contain the answer, say that you cannot find it in these lessons. Do not add outside facts.' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.2,
      max_tokens: 220,
      stream: true,
    });
    let complete = '';
    for await (const part of response) {
      if (aborted) break;
      const text = part.choices?.[0]?.delta?.content ?? '';
      if (text) { onToken(); complete += text; ctx.postMessage({ type: 'token', text }); }
    }
    if (aborted) return;
    if (!complete.trim()) throw new Error('The offline model returned an empty answer.');
    ctx.postMessage({ type: 'done', text: complete });
    return;
  }
  const stream = await engine.createChatCompletion({
    messages: [
      { role: 'system', content: 'Answer only using this material, in simple English. If the material does not contain the answer, say that you cannot find it in these lessons. Do not add outside facts.' },
      { role: 'user', content: prompt },
    ],
    max_tokens: 220,
    stream: true,
  });
  let complete = '';
  for await (const part of stream) {
    if (aborted) break;
    const text = typeof part === 'string' ? part : part.choices?.[0]?.delta?.content ?? part.content ?? '';
    if (text) { onToken(); complete += text; ctx.postMessage({ type: 'token', text }); }
  }
  if (aborted) return;
  if (!complete.trim()) throw new Error('The offline model returned an empty answer.');
  ctx.postMessage({ type: 'done', text: complete });
}

ctx.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const message = event.data;
  if (message.type === 'stop') { aborted = true; try { engine?.interruptGenerate?.(); } catch { /* ignore */ } return; }
  if (message.type === 'unload') { aborted = true; engine = undefined; backendInUse = ''; ctx.postMessage({ type: 'unloaded' }); return; }
  try {
    if (message.type === 'load') await loadModel(message);
    if (message.type === 'answer') await answer(message.question, message.material, message.prompt);
  } catch (error) {
    const gpuLost = backendInUse === 'WebGPU' && /Instance reference|mapAsync|device.*lost|DeviceLost/i.test(error instanceof Error ? error.message : String(error));
    if (gpuLost) { engine = undefined; backendInUse = ''; }
    ctx.postMessage({ type: 'error', scope: message.type === 'answer' ? 'chat' : 'load', text: gpuLost ? 'The phone graphics chip stopped during the answer. Choose a CPU option in the model list, then tap Download / Prepare.' : error instanceof Error ? error.message : 'Local model encountered an unexpected error.' });
  }
};

// Surface anything unexpected (GPU device lost, out of memory...) instead of failing silently.
ctx.addEventListener('unhandledrejection', (event) => {
  if (!backendInUse) return; // while loading, failures are handled (and fall back to CPU) in loadModel
  const reason = (event as PromiseRejectionEvent).reason;
  ctx.postMessage({ type: 'error', scope: 'chat', text: reason instanceof Error ? reason.message : 'The offline model stopped unexpectedly.' });
});

export {};
  
