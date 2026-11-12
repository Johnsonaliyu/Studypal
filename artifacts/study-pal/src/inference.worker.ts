/// <reference lib="webworker" />
type WorkerRequest =
  | { type: 'load'; backend: 'webgpu' | 'cpu'; model: 'lite' | 'standard' }
  | { type: 'answer'; prompt: string; material: string; question: string }
  | { type: 'unload' };

const ctx: DedicatedWorkerGlobalScope = self as DedicatedWorkerGlobalScope;
let engine: any;
let backendInUse = '';
let aborted = false;

const webGpuModels: Record<string, string> = {
  lite: 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC',
  standard: 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC',
};
const cpuModels = {
  lite: { repo: 'bartowski/Qwen2.5-0.5B-Instruct-GGUF', file: 'Qwen2.5-0.5B-Instruct-Q4_K_M.gguf' },
  standard: { repo: 'bartowski/Qwen2.5-1.5B-Instruct-GGUF', file: 'Qwen2.5-1.5B-Instruct-Q4_K_M.gguf' },
};

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
      const webllm = await import('@mlc-ai/web-llm');
      const modelId = webGpuModels[request.model];
      const list = (webllm.prebuiltAppConfig as any)?.model_list as Array<{ model_id: string }> | undefined;
      if (list && !list.some((item) => item.model_id === modelId)) throw new Error(`The installed WebLLM registry does not include ${modelId}. Update the app to use a supported model.`);
      engine = await webllm.CreateMLCEngine(modelId, {
        initProgressCallback: (progress: { progress?: number; text?: string }) => ctx.postMessage({ type: 'progress', progress: Math.round((progress.progress ?? 0) * 100), text: progress.text ?? 'Preparing WebGPU model…' }),
      });
      backendInUse = 'WebGPU';
      ctx.postMessage({ type: 'ready', backend: backendInUse, model: modelId });
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : 'WebLLM model could not be loaded. Check WebGPU compatibility and available storage.');
    }
    return;
  }
  try {
    const wllama = await import('@wllama/wllama');
    const Wllama = (wllama as any).Wllama;
    const paths = (wllama as any).WLLAMA_CONFIG_PATHS;
    if (!Wllama || !paths) throw new Error('This installed wllama package does not expose the documented browser API.');
    engine = new Wllama(paths);
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
      if (text) { complete += text; ctx.postMessage({ type: 'token', text }); }
    }
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
    if (text) { complete += text; ctx.postMessage({ type: 'token', text }); }
  }
  ctx.postMessage({ type: 'done', text: complete });
}

ctx.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const message = event.data;
  if (message.type === 'unload') { aborted = true; engine = undefined; backendInUse = ''; ctx.postMessage({ type: 'unloaded' }); return; }
  try {
    if (message.type === 'load') await loadModel(message);
    if (message.type === 'answer') await answer(message.question, message.material, message.prompt);
  } catch (error) {
    ctx.postMessage({ type: 'error', scope: message.type === 'answer' ? 'chat' : 'load', text: error instanceof Error ? error.message : 'Local model encountered an unexpected error.' });
  }
};

export {};
