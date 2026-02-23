import { defineEndpoint } from '@directus/extensions-sdk';

// AI Agent endpoint – runs chat requests as background jobs with polling support.
//
// POST /ai-agent/chat
//   Body: { model?: string, messages: Array<{ role: string, content: string }>, allowInternet?: boolean, tools?: unknown[] }
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
const JOB_TTL_MS = 10 * 60 * 1000; // 10 minutes
const MAX_AGENT_ITERATIONS = 10;
const MAX_FETCHED_CONTENT_LENGTH = 4000;
const WEB_SEARCH_TIMEOUT_MS = 10_000;
const FETCH_URL_TIMEOUT_MS = 15_000;
const OLLAMA_INFERENCE_TIMEOUT_MS = 300_000; // 5 minutes
const DUCKDUCKGO_SEARCH_BASE_URL = 'https://duckduckgo.com/?q=';

interface Job {
  status: 'pending' | 'running' | 'done' | 'error';
  partialContent: string;
  /** Short status description of what the AI is currently doing (e.g. visiting a URL). */
  currentActivity?: string;
  /** URLs that were visited during the agent loop (for source attribution). */
  visitedUrls: string[];
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
    // Replace angle brackets so the result is clean plain text sent to the AI model only.
    const cleaned = text.replace(/[<>]/g, ' ').replace(/\s+/g, ' ').trim();
    return cleaned.length > MAX_FETCHED_CONTENT_LENGTH ? `${cleaned.slice(0, MAX_FETCHED_CONTENT_LENGTH)}…` : cleaned;
  } catch (err) {
    return `Fetch error: ${err instanceof Error ? err.message : String(err)}`;
  }
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

async function runAgentLoop(
  messages: OllamaMessage[],
  model: string,
  tools: unknown[],
  job: Job,
): Promise<void> {
  const currentMessages = [...messages];

  // Always prepend a German system prompt so the model answers in German.
  // When internet tools are active, also instruct the model to use them.
  if (currentMessages[0]?.role !== 'system') {
    let systemContent =
      'Du bist ein hilfreicher KI-Assistent. Antworte IMMER auf Deutsch.';
    if (tools.length > 0) {
      systemContent +=
        ' Du hast Zugriff auf aktuelle Internet-Tools.' +
        ' WICHTIG: Wenn der Benutzer nach aktuellen Nachrichten, Ereignissen, Preisen, Wetter' +
        ' oder anderen Informationen fragt, die sich seit deinem Training geändert haben könnten,' +
        ' MUSST du sofort das web_search oder fetch_url Tool aufrufen.' +
        ' Sage NIEMALS, dass du keinen Internetzugriff hast – du hast die Tools und MUSST sie nutzen.';
    }
    currentMessages.unshift({ role: 'system', content: systemContent });
  }

  // Update the debug payload with the actual messages (including system prompt) and tools
  // that will be sent to Ollama so the frontend can display them in debug mode.
  job.debugPayload = {
    ...job.debugPayload,
    actualMessages: currentMessages,
    tools,
  };

  for (let iteration = 0; iteration < MAX_AGENT_ITERATIONS; iteration++) {
    job.status = 'running';

    const ollamaBody: Record<string, unknown> = {
      model,
      messages: currentMessages,
      stream: true,
    };
    if (tools.length > 0) {
      ollamaBody.tools = tools;
    }

    const ollamaResponse = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ollamaBody),
      signal: AbortSignal.timeout(OLLAMA_INFERENCE_TIMEOUT_MS),
    });

    if (!ollamaResponse.ok) {
      const text = await ollamaResponse.text();
      throw new Error(`Ollama returned ${ollamaResponse.status}: ${text}`);
    }

    if (!ollamaResponse.body) throw new Error('No response body from Ollama');

    // Read streaming response; update partialContent so pollers see live output
    const reader = ollamaResponse.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let accumulatedContent = '';
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
            accumulatedContent += chunk.message.content;
            job.partialContent = accumulatedContent;
          }
          if (chunk.message?.tool_calls) {
            toolCalls = chunk.message.tool_calls;
          }
        } catch {
          // ignore malformed chunk
        }
      }
    }

    // If the model requested tool calls, execute them and continue the loop
    if (toolCalls && toolCalls.length > 0 && tools.length > 0) {
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

        currentMessages.push({ role: 'tool', content: toolResult });
      }

      // Reset partial content so the poller sees fresh output for the next iteration
      job.partialContent = '';
      job.currentActivity = undefined;
      toolCalls = undefined;
      continue;
    }

    // No tool calls – this is the final answer
    job.message = { role: 'assistant', content: accumulatedContent };
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
        message: job.message,
        error: job.error,
        debugPayload: job.debugPayload,
      });
    });

    // Chat endpoint – starts an async job and returns jobId immediately
    router.post('/chat', (req, res) => {
      const { messages, model, tools, allowInternet = true } = req.body as {
        messages?: Array<{ role: string; content: string }>;
        model?: string;
        tools?: unknown[];
        allowInternet?: boolean;
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
          effectiveTools,
        },
      };
      jobs.set(jobId, job);

      // Start inference in the background – do NOT await
      runAgentLoop(messages as OllamaMessage[], model ?? DEFAULT_MODEL, effectiveTools, job).catch((err) => {
        job.status = 'error';
        job.error = err instanceof Error ? err.message : String(err);
      });

      return res.json({ jobId });
    });
  },
});
