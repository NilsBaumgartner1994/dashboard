import { defineEndpoint } from '@directus/extensions-sdk';

// AI Agent endpoint – proxies chat requests to the local Ollama instance.
//
// POST /ai-agent/chat
//   Body: { model?: string, messages: Array<{ role: string, content: string }>, stream?: boolean }
//   Returns: Ollama /api/chat response (JSON or newline-delimited JSON when stream=true)
//
// GET /ai-agent/models
//   Returns: list of locally available Ollama models
//
// GET /ai-agent/health
//   Returns: { ok: true } when Ollama is reachable, { ok: false, error: string } otherwise

const OLLAMA_URL = process.env.OLLAMA_URL ?? 'http://localhost:11434';
const DEFAULT_MODEL = process.env.OLLAMA_MODEL ?? 'llama3.1:8b';

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
        const data = await response.json() as { models?: unknown[] };
        return res.json({ models: data.models ?? [] });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return res.status(503).json({ error: message });
      }
    });

    // Chat endpoint
    router.post('/chat', async (req, res) => {
      try {
        const { messages, model, stream = false, tools } = req.body as {
          messages?: Array<{ role: string; content: string }>;
          model?: string;
          stream?: boolean;
          tools?: unknown[];
        };

        if (!Array.isArray(messages) || messages.length === 0) {
          return res.status(400).json({ error: 'messages array is required and must not be empty' });
        }

        const ollamaBody: Record<string, unknown> = {
          model: model ?? DEFAULT_MODEL,
          messages,
          stream,
        };

        if (Array.isArray(tools) && tools.length > 0) {
          ollamaBody.tools = tools;
        }

        const ollamaResponse = await fetch(`${OLLAMA_URL}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(ollamaBody),
          signal: AbortSignal.timeout(120000), // 2-minute timeout for inference
        });

        if (!ollamaResponse.ok) {
          const text = await ollamaResponse.text();
          return res.status(502).json({ error: `Ollama returned ${ollamaResponse.status}`, details: text });
        }

        const contentType = ollamaResponse.headers.get('content-type') ?? 'application/json';
        res.set('Content-Type', contentType);
        res.set('Access-Control-Allow-Origin', '*');

        // When streaming, pipe the raw response body through
        if (stream && ollamaResponse.body) {
          res.set('Transfer-Encoding', 'chunked');
          const reader = ollamaResponse.body.getReader();
          const pump = async () => {
            const { done, value } = await reader.read();
            if (done) { res.end(); return; }
            res.write(Buffer.from(value));
            await pump();
          };
          await pump();
          return;
        }

        const data = await ollamaResponse.text();
        return res.send(data);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return res.status(500).json({ error: 'Failed to contact AI agent', details: message });
      }
    });
  },
});
