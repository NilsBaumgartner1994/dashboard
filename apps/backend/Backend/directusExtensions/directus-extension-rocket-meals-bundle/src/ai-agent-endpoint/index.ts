import { defineEndpoint } from '@directus/extensions-sdk';

// AI Agent endpoint – runs chat requests as background jobs with polling support.
//
// POST /ai-agent/chat
//   Body: { model?: string, messages: Array<{ role: string, content: string }>, allowInternet?: boolean, thinking?: boolean, tools?: unknown[] }
//   Returns: { jobId: string }  (inference runs in the background)
//
// GET /ai-agent/job/:id
//   Returns: { status: 'pending'|'running'|'done'|'error', partialContent: string, message?: {...}, error?: string }
//
// GET /ai-agent/models
//   Returns: list of locally available Ollama models
//
// GET /ai-agent/health
//   Returns: { ok: true } when Ollama is reachable, { ok: false, error: string } otherwise

const OLLAMA_URL = process.env.OLLAMA_URL ?? 'http://localhost:11434';
const DEFAULT_MODEL = process.env.OLLAMA_MODEL ?? 'llama3.1:8b';
// Context window size sent to Ollama on every request.
// llama3.1 defaults to 131 072 tokens which is extremely slow on CPU.
// 4096 is sufficient for conversational use and gives a ~10–20× speed-up.
const OLLAMA_NUM_CTX = parseInt(process.env.OLLAMA_NUM_CTX ?? '4096', 10);
// Optional CPU-thread cap – leave unset to let Ollama auto-detect, or set via
// OLLAMA_NUM_THREADS to reserve cores for co-located services (e.g. Postgres).
const OLLAMA_NUM_THREADS = process.env.OLLAMA_NUM_THREADS
  ? parseInt(process.env.OLLAMA_NUM_THREADS, 10)
  : undefined;
// Shared inference options sent on every /api/chat request.
const OLLAMA_OPTIONS: Record<string, unknown> = {
  num_ctx: OLLAMA_NUM_CTX,
  ...(OLLAMA_NUM_THREADS !== undefined ? { num_thread: OLLAMA_NUM_THREADS } : {}),
};
const JOB_TTL_MS = 10 * 60 * 1000; // 10 minutes
const MAX_AGENT_ITERATIONS = 10;
const MAX_FETCHED_CONTENT_LENGTH = 4000;
const WEB_SEARCH_TIMEOUT_MS = 10_000;
const FETCH_URL_TIMEOUT_MS = 15_000;
const OLLAMA_INFERENCE_TIMEOUT_MS = 300_000; // 5 minutes
const DUCKDUCKGO_SEARCH_BASE_URL = 'https://duckduckgo.com/?q=';

interface PlannedStep {
  text: string;
  done: boolean;
}

interface Job {
  status: 'pending' | 'running' | 'done' | 'error';
  partialContent: string;
  /** Short status description of what the AI is currently doing (e.g. visiting a URL). */
  currentActivity?: string;
  /** URLs that were visited during the agent loop (for source attribution). */
  visitedUrls: string[];
  /** Steps extracted from thinking-mode analysis, with completion status. */
  plannedSteps?: PlannedStep[];
  message?: { role: string; content: string };
  error?: string;
  createdAt: number;
  /** The exact payload that was sent to Ollama – exposed for frontend debug mode. */
  debugPayload?: Record<string, unknown>;
}

const jobs = new Map<string, Job>();

// Clean up expired jobs periodically to avoid memory leaks
setInterval(() => {
  const now = Date.now();
  for (const [id, job] of jobs) {
    if (now - job.createdAt > JOB_TTL_MS) {
      jobs.delete(id);
    }
  }
}, 60_000);

// Internet tool definitions passed to Ollama so the model can browse the web
const INTERNET_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'web_search',
      description:
        'Search the web for current information. Use this to find up-to-date facts, news, or any information you are unsure about.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'The search query' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'fetch_url',
      description: 'Fetch the text content of a web page by URL.',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'The full URL to fetch' },
        },
        required: ['url'],
      },
    },
  },
];

/** Sets both currentActivity and partialContent on a job in one call. */
function setJobActivity(job: Job, activity: string): void {
  job.currentActivity = activity;
  job.partialContent = activity;
}

/**
 * Parses a numbered/bulleted list from an AI-generated analysis text and returns
 * an array of steps with initial `done: false` status.
 */
function extractPlannedSteps(text: string): PlannedStep[] {
  const steps: PlannedStep[] = [];
  for (const line of text.split('\n')) {
    const cleaned = line.trim();
    // Match "1. ...", "2) ...", "Schritt 1: ...", "* ...", "- ...", "• ..."
    const match = cleaned.match(/^(?:\d+[.):\s]\s*|Schritt\s+\d+[:.]\s+|[*\-•]\s+)(.+)/);
    if (match && match[1]) {
      const stepText = match[1].replace(/^\*\*|\*\*$/g, '').trim();
      if (stepText.length > 3) {
        steps.push({ text: stepText, done: false });
      }
    }
  }
  return steps;
}

async function executeWebSearch(query: string): Promise<string> {
  try {
    // Use DuckDuckGo HTML endpoint for more reliable search results
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const response = await fetch(url, {
      signal: AbortSignal.timeout(WEB_SEARCH_TIMEOUT_MS),
      headers: {
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });
    if (!response.ok) return `Search failed with status ${response.status}`;
    const html = await response.text();

    // Extract result titles and snippets from DuckDuckGo HTML response
    const results: string[] = [];

    // Match result titles
    const titleMatches = html.matchAll(/<a[^>]+class="result__a"[^>]*>([^<]+)<\/a>/g);
    const titles = [...titleMatches].map((m) => (m[1] ?? '').trim()).filter(Boolean);

    // Match result snippets
    const snippetMatches = html.matchAll(/<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g);
    const snippets = [...snippetMatches]
      .map((m) => {
        // Replace angle brackets so the result is clean plain text.
        // The content is sent to the AI model only, never rendered as HTML.
        return (m[1] ?? '').replace(/[<>]/g, ' ').replace(/\s+/g, ' ').trim();
      })
      .filter(Boolean);

    for (let i = 0; i < Math.min(titles.length, snippets.length, 5); i++) {
      results.push(`${i + 1}. ${titles[i]}\n   ${snippets[i]}`);
    }

    if (results.length > 0) {
      return `Search results for "${query}":\n\n${results.join('\n\n')}`;
    }

    // Fallback: DuckDuckGo instant-answer JSON API
    const apiUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
    const apiResponse = await fetch(apiUrl, { signal: AbortSignal.timeout(WEB_SEARCH_TIMEOUT_MS) });
    if (!apiResponse.ok) return `Search failed with status ${apiResponse.status}`;
    const data = (await apiResponse.json()) as {
      AbstractText?: string;
      AbstractURL?: string;
      RelatedTopics?: Array<{ Text?: string; FirstURL?: string }>;
      Answer?: string;
    };
    const parts: string[] = [];
    if (data.Answer) parts.push(`Answer: ${data.Answer}`);
    if (data.AbstractText) parts.push(`Summary: ${data.AbstractText}\nSource: ${data.AbstractURL ?? ''}`);
    if (data.RelatedTopics?.length) {
      const topics = data.RelatedTopics.slice(0, 5)
        .filter((t) => t.Text)
        .map((t) => `- ${t.Text ?? ''} (${t.FirstURL ?? ''})`);
      if (topics.length > 0) parts.push(`Related:\n${topics.join('\n')}`);
    }
    return parts.length > 0 ? parts.join('\n\n') : 'No results found for this query.';
  } catch (err) {
    return `Search error: ${err instanceof Error ? err.message : String(err)}`;
  }
}

async function executeFetchUrl(url: string): Promise<string> {
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_URL_TIMEOUT_MS),
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DashboardBot/1.0)' },
    });
    if (!response.ok) return `Fetch failed with status ${response.status}`;
    const text = await response.text();
    // Remove script and style blocks entirely, then strip all remaining HTML tags
    // so the AI receives clean readable plain text instead of raw markup.
    const cleaned = text
      .replace(/<script[\s\S]*?<\/script[^>]*>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style[^>]*>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return cleaned.length > MAX_FETCHED_CONTENT_LENGTH ? `${cleaned.slice(0, MAX_FETCHED_CONTENT_LENGTH)}…` : cleaned;
  } catch (err) {
    return `Fetch error: ${err instanceof Error ? err.message : String(err)}`;
  }
}

/**
 * Detects inline JSON-formatted tool calls that some models output as plain text
 * instead of using Ollama's native tool_calls format.
 * Example: {"name": "web_search", "parameters": {"query": "..."}}
 */
function parseInlineToolCalls(content: string): Array<{ function: { name: string; arguments: Record<string, unknown> } }> {
  const calls: Array<{ function: { name: string; arguments: Record<string, unknown> } }> = [];
  // Match JSON objects with at most one level of nesting (sufficient for our tool schemas
  // which have a single nested object for parameters, e.g. {"name": "...", "parameters": {"query": "..."}})
  const jsonBlocks = content.match(/\{(?:[^{}]|\{[^{}]*\})*\}/g);
  if (!jsonBlocks) return calls;
  for (const block of jsonBlocks) {
    try {
      const parsed = JSON.parse(block) as Record<string, unknown>;
      const name = typeof parsed.name === 'string' ? parsed.name : undefined;
      if (name === 'web_search' || name === 'fetch_url') {
        // Accept multiple field name variants: "parameters" (OpenAI-style text output),
        // "arguments" (Ollama native), or "args" (other common variants).
        const rawArgs = (parsed.parameters ?? parsed.arguments ?? parsed.args ?? {}) as Record<string, unknown>;
        calls.push({ function: { name, arguments: rawArgs } });
      }
    } catch {
      // not valid JSON, skip
    }
  }
  return calls;
}

interface OllamaMessage {
  role: string;
  content: string | null;
  tool_calls?: Array<{ function: { name: string; arguments: Record<string, unknown> } }>;
}

interface OllamaChatChunk {
  message?: OllamaMessage;
  done?: boolean;
}

/**
 * Sends a single chat request to Ollama with streaming and accumulates the response.
 * Updates job.partialContent in real-time so pollers see live output.
 */
async function streamOllamaCall(
  messages: OllamaMessage[],
  model: string,
  job: Job,
  tools: unknown[] = [],
): Promise<{ content: string; toolCalls?: Array<{ function: { name: string; arguments: Record<string, unknown> } }> }> {
  const body: Record<string, unknown> = {
    model,
    messages,
    stream: true,
    options: OLLAMA_OPTIONS,
  };
  if (tools.length > 0) body.tools = tools;

  const response = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(OLLAMA_INFERENCE_TIMEOUT_MS),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Ollama returned ${response.status}: ${text}`);
  }
  if (!response.body) throw new Error('No response body from Ollama');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let content = '';
  let toolCalls: Array<{ function: { name: string; arguments: Record<string, unknown> } }> | undefined;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const chunk = JSON.parse(trimmed) as OllamaChatChunk;
        if (chunk.message?.content) {
          content += chunk.message.content;
          job.partialContent = content;
        }
        if (chunk.message?.tool_calls) toolCalls = chunk.message.tool_calls;
      } catch {
        // ignore malformed chunk
      }
    }
  }

  return { content, toolCalls };
}

async function runAgentLoop(
  messages: OllamaMessage[],
  model: string,
  tools: unknown[],
  job: Job,
  thinking = false,
): Promise<void> {
  const currentMessages = [...messages];

  // Always prepend a German system prompt so the model answers in German.
  // When internet tools are active, also instruct the model to use them.
  // In thinking mode, use a structured analytical system prompt.
  if (currentMessages[0]?.role !== 'system') {
    // Instructions shared by all system prompts to improve handling of user input.
    const INPUT_TRUST_INSTRUCTIONS =
      ' Wichtig: Übernimm Namen, Orte und Suchbegriffe GENAU so wie der Benutzer sie schreibt –' +
      ' korrigiere die Schreibweise von Eigennamen NICHT.' +
      ' Informelle Ausdrücke: "auf?" / "hat auf" / "offen?" bei einem Geschäft oder Ort bedeutet immer' +
      ' "geöffnet?" bzw. "Öffnungszeiten".';
    let systemContent: string;
    if (thinking) {
      systemContent =
        'Du bist ein KI-Agent. Antworte IMMER auf Deutsch.\n' +
        'Gehe bei jeder Anfrage strukturiert vor:\n' +
        '1. ANALYSE: Was möchte der Benutzer genau wissen? Welche Informationen werden benötigt?\n' +
        '2. PLAN: Welche konkreten Schritte sind nötig um alle Informationen zu beschaffen?\n' +
        '3. AUSFÜHRUNG: Führe alle Schritte systematisch aus.\n' +
        '4. SYNTHESE: Gib eine vollständige, destillierte Antwort.' +
        INPUT_TRUST_INSTRUCTIONS;
      if (tools.length > 0) {
        systemContent +=
          '\nDu bist ein autonomer KI-Agent mit Zugriff auf web_search und fetch_url.' +
          ' Nutze diese Tools SYSTEMATISCH für jeden Schritt deines Plans.' +
          ' Beantworte Fragen über lokale Geschäfte, Öffnungszeiten, Veranstaltungen oder aktuelle Fakten' +
          ' IMMER durch eine web_search – verlasse dich NIEMALS auf Trainingsdaten für solche Anfragen.' +
          ' Höre NICHT auf zu suchen, bis du ALLE benötigten Informationen gefunden hast.' +
          ' Sage dem Benutzer NIEMALS, dass er selbst nachschauen soll.' +
          ' Sage NIEMALS, dass du keinen Internetzugriff hast.';
      }
    } else {
      systemContent =
        'Du bist ein hilfreicher KI-Assistent. Antworte IMMER auf Deutsch.' +
        INPUT_TRUST_INSTRUCTIONS;
      if (tools.length > 0) {
        systemContent +=
          ' Du hast Zugriff auf aktuelle Internet-Tools: web_search und fetch_url.' +
          ' WICHTIG: Wenn der Benutzer nach aktuellen Nachrichten, Ereignissen, Preisen, Wetter' +
          ' oder anderen Informationen fragt, die sich seit deinem Training geändert haben könnten,' +
          ' MUSST du sofort das web_search Tool aufrufen.' +
          ' Nach einer Suche MUSST du mit fetch_url die relevantesten Seiten aufrufen um den genauen Inhalt zu lesen.' +
          ' Du kannst und sollst mehrere fetch_url Aufrufe nacheinander machen um Informationen von verschiedenen Quellen zu sammeln.' +
          ' Erst wenn du genug Informationen aus den Webseiten gesammelt hast, antworte dem Benutzer mit einer umfassenden Antwort.' +
          ' Sage NIEMALS, dass du keinen Internetzugriff hast – du hast die Tools und MUSST sie nutzen.';
      }
    }
    currentMessages.unshift({ role: 'system', content: systemContent });
  }

  // Update the debug payload with the actual messages (including system prompt) and tools
  // that will be sent to Ollama so the frontend can display them in debug mode.
  job.debugPayload = {
    ...job.debugPayload,
    actualMessages: currentMessages,
    tools,
    options: OLLAMA_OPTIONS,
    thinking,
  };

  // === Phase 1 (thinking mode only): Analysis & Planning ===
  // Ask the model to analyse the question and create a step-by-step plan before
  // executing any tool calls.  This mirrors a "think before you act" approach.
  if (thinking) {
    setJobActivity(job, 'KI analysiert die Frage und erstellt einen Plan…');

    const analysisSystemMsg: OllamaMessage = {
      role: 'system',
      content:
        'Du bist ein KI-Agent. Antworte IMMER auf Deutsch.\n' +
        'Analysiere die folgende Frage und erstelle einen detaillierten Schritt-für-Schritt-Plan:\n' +
        '- Was genau möchte der Benutzer wissen?\n' +
        '- Welche konkreten Informationen werden benötigt?\n' +
        '- Welche Schritte sind notwendig, um alle Informationen zu beschaffen?\n' +
        '- Übernimm Namen und Suchbegriffe GENAU so wie der Benutzer sie nennt (keine Rechtschreibkorrektur bei Eigennamen).\n' +
        (tools.length > 0
          ? 'WICHTIG: Plane für jeden Schritt konkrete web_search-Suchanfragen – du musst die Informationen aktiv suchen.\n'
          : '') +
        'Gib NUR die Analyse und den Plan aus, noch KEINE endgültige Antwort.',
    };

    const { content: analysisContent } = await streamOllamaCall(
      [analysisSystemMsg, ...messages],
      model,
      job,
    );

    // Extract step-by-step plan from the analysis so the frontend can show checkboxes.
    job.plannedSteps = extractPlannedSteps(analysisContent);

    // Inject the plan into the execution context so the model follows it.
    const executionPrompt =
      tools.length > 0
        ? 'Führe nun den Plan systematisch aus. Nutze alle verfügbaren Tools für jeden Schritt.'
        : 'Führe nun den Plan systematisch aus und beantworte die Frage vollständig.';
    currentMessages.push(
      { role: 'assistant', content: analysisContent },
      { role: 'user', content: executionPrompt },
    );

    job.partialContent = '';
    job.currentActivity = undefined;

    // Replace the analytical system prompt with an execution-focused agent prompt
    // so the model calls tools natively instead of writing tool calls as plain text.
    if (currentMessages[0]?.role === 'system') {
      let execSystemContent =
        'Du bist ein KI-Agent. Antworte IMMER auf Deutsch.' +
        ' Übernimm Eigennamen GENAU so wie vom Benutzer angegeben – keine automatische Rechtschreibkorrektur.';
      if (tools.length > 0) {
        execSystemContent +=
          ' Du hast Zugriff auf aktuelle Internet-Tools: web_search und fetch_url.' +
          ' WICHTIG: Rufe diese Tools direkt auf – schreibe Tool-Aufrufe NICHT als Text in deine Antwort.' +
          ' Führe JEDEN Schritt deines Plans aus und rufe web_search für JEDEN Schritt auf, der Informationen erfordert.' +
          ' Beantworte die Frage NUR auf Basis der tatsächlich gefundenen Informationen – NICHT aus deinen Trainingsdaten.' +
          ' Sage NIEMALS, dass du keinen Internetzugriff hast.';
      }
      currentMessages[0] = { role: 'system', content: execSystemContent };
      job.debugPayload = { ...job.debugPayload, actualMessages: currentMessages };
    }
  }

  // === Phase 2 / Main: Execution loop ===
  let toolsWereUsed = false;

  for (let iteration = 0; iteration < MAX_AGENT_ITERATIONS; iteration++) {
    job.status = 'running';

    const { content: accumulatedContent, toolCalls } = await streamOllamaCall(
      currentMessages,
      model,
      job,
      tools,
    );

    // If the model requested tool calls, execute them and continue the loop
    if (toolCalls && toolCalls.length > 0 && tools.length > 0) {
      toolsWereUsed = true;
      currentMessages.push({ role: 'assistant', content: accumulatedContent || null, tool_calls: toolCalls });

      for (const toolCall of toolCalls) {
        const { name, arguments: args } = toolCall.function;
        let toolResult: string;

        if (name === 'web_search') {
          const query = args.query as string;
          setJobActivity(job, `KI sucht im Internet: "${query}"…`);
          job.visitedUrls.push(`${DUCKDUCKGO_SEARCH_BASE_URL}${encodeURIComponent(query)}`);
          toolResult = await executeWebSearch(query);
        } else if (name === 'fetch_url') {
          const url = args.url as string;
          setJobActivity(job, `KI besucht Webseite: ${url}…`);
          job.visitedUrls.push(url);
          const rawContent = await executeFetchUrl(url);
          setJobActivity(job, `KI verarbeitet Inhalt der Webseite: ${url}…`);
          toolResult = rawContent;
        } else {
          toolResult = `Unknown tool: ${name}`;
        }

        // Mark the next uncompleted planned step as done so the frontend can update checkboxes.
        if (job.plannedSteps) {
          const nextStep = job.plannedSteps.find((s) => !s.done);
          if (nextStep) nextStep.done = true;
        }

        currentMessages.push({ role: 'tool', content: toolResult });
      }

      // Reset partial content so the poller sees fresh output for the next iteration
      job.partialContent = '';
      job.currentActivity = undefined;
      continue;
    }

    // Fallback: detect inline JSON tool calls that some models write as plain text
    // instead of using Ollama's native tool_calls format.
    if (tools.length > 0) {
      const inlineCalls = parseInlineToolCalls(accumulatedContent);
      if (inlineCalls.length > 0) {
        toolsWereUsed = true;
        currentMessages.push({ role: 'assistant', content: accumulatedContent || null });

        for (const toolCall of inlineCalls) {
          const { name, arguments: args } = toolCall.function;
          let toolResult: string;

          if (name === 'web_search') {
            const query = args.query as string;
            setJobActivity(job, `KI sucht im Internet: "${query}"…`);
            job.visitedUrls.push(`${DUCKDUCKGO_SEARCH_BASE_URL}${encodeURIComponent(query)}`);
            toolResult = await executeWebSearch(query);
          } else if (name === 'fetch_url') {
            const url = args.url as string;
            setJobActivity(job, `KI besucht Webseite: ${url}…`);
            job.visitedUrls.push(url);
            const rawContent = await executeFetchUrl(url);
            setJobActivity(job, `KI verarbeitet Inhalt der Webseite: ${url}…`);
            toolResult = rawContent;
          } else {
            toolResult = `Unknown tool: ${name}`;
          }

          if (job.plannedSteps) {
            const nextStep = job.plannedSteps.find((s) => !s.done);
            if (nextStep) nextStep.done = true;
          }

          currentMessages.push({ role: 'tool', content: toolResult });
        }

        job.partialContent = '';
        job.currentActivity = undefined;
        continue;
      }
    }

    // No tool calls – in thinking mode with prior tool use, proceed to synthesis.
    // When no tools were used (e.g. allowInternet=false), the model's response is
    // already complete so we return it directly without a separate synthesis step.
    if (thinking && toolsWereUsed) {
      currentMessages.push({ role: 'assistant', content: accumulatedContent || null });
      break;
    }

    // No tool calls – this is the final answer
    job.message = { role: 'assistant', content: accumulatedContent };
    job.status = 'done';
    return;
  }

  // === Phase 3 (thinking mode only): Synthesis ===
  // Distil all gathered information into one complete, well-structured answer.
  if (thinking && toolsWereUsed) {
    setJobActivity(job, 'KI formuliert die finale Antwort…');
    job.partialContent = '';

    currentMessages.push({
      role: 'user',
      content:
        'Fasse nun alle gesammelten Informationen zu einer vollständigen, präzisen und gut strukturierten Antwort zusammen. ' +
        'Stelle sicher, dass alle relevanten Details enthalten sind und die Antwort vollständig ist.',
    });

    const { content: synthesisContent } = await streamOllamaCall(currentMessages, model, job);

    job.message = { role: 'assistant', content: synthesisContent };
    job.status = 'done';
    return;
  }

  throw new Error('Max agent iterations reached');
}

export default defineEndpoint({
  id: 'ai-agent',
  handler: (router) => {
    // Health check
    router.get('/health', async (_req, res) => {
      try {
        const response = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(5000) });
        if (!response.ok) {
          return res.status(502).json({ ok: false, error: `Ollama returned ${response.status}` });
        }
        return res.json({ ok: true, ollamaUrl: OLLAMA_URL });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return res.status(503).json({ ok: false, error: message });
      }
    });

    // List available models
    router.get('/models', async (_req, res) => {
      try {
        const response = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(10000) });
        if (!response.ok) {
          return res.status(502).json({ error: `Ollama returned ${response.status}` });
        }
        const data = (await response.json()) as { models?: unknown[] };
        return res.json({ models: data.models ?? [] });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return res.status(503).json({ error: message });
      }
    });

    // Get job status (used for polling by the frontend)
    router.get('/job/:id', (req, res) => {
      const job = jobs.get(req.params.id);
      if (!job) {
        return res.status(404).json({ error: 'Job not found' });
      }
      return res.json({
        status: job.status,
        partialContent: job.partialContent,
        currentActivity: job.currentActivity,
        visitedUrls: job.visitedUrls,
        plannedSteps: job.plannedSteps,
        message: job.message,
        error: job.error,
        debugPayload: job.debugPayload,
      });
    });

    // Chat endpoint – starts an async job and returns jobId immediately
    router.post('/chat', (req, res) => {
      const { messages, model, tools, allowInternet = true, thinking = false } = req.body as {
        messages?: Array<{ role: string; content: string }>;
        model?: string;
        tools?: unknown[];
        allowInternet?: boolean;
        thinking?: boolean;
      };

      if (!Array.isArray(messages) || messages.length === 0) {
        return res.status(400).json({ error: 'messages array is required and must not be empty' });
      }

      // Build effective tools list: caller-provided tools + internet tools when allowed
      const effectiveTools: unknown[] = [];
      if (Array.isArray(tools) && tools.length > 0) {
        effectiveTools.push(...tools);
      }
      if (allowInternet) {
        effectiveTools.push(...INTERNET_TOOLS);
      }

      const jobId = `job-${crypto.randomUUID()}`;
      const job: Job = {
        status: 'pending',
        partialContent: '',
        visitedUrls: [],
        createdAt: Date.now(),
        debugPayload: {
          model: model ?? DEFAULT_MODEL,
          messages,
          allowInternet,
          thinking,
          effectiveTools,
        },
      };
      jobs.set(jobId, job);

      // Start inference in the background – do NOT await
      runAgentLoop(messages as OllamaMessage[], model ?? DEFAULT_MODEL, effectiveTools, job, thinking).catch((err) => {
        job.status = 'error';
        job.error = err instanceof Error ? err.message : String(err);
      });

      return res.json({ jobId });
    });
  },
});
