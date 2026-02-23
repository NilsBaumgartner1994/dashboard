import { defineEndpoint } from '@directus/extensions-sdk';
import { DatabaseInitializedCheck } from '../helpers/DatabaseInitializedCheck';
import { OllamaHelper, OllamaChatMessage, OllamaTaskType } from '../helpers/OllamaHelper';

// ──────────────────────────────────────────────────────────────────────────────
// AI Endpoint
//
// Exposes the local Ollama service to the Directus backend via two routes:
//
//   GET  /ai/models          – list models available on the Ollama instance
//   POST /ai/chat            – send a chat / completion request
//
// The Ollama container is only reachable from inside `directus_network`, so
// external callers must go through this Directus endpoint.
//
// POST /ai/chat body (JSON):
//   {
//     "taskType": "text" | "code" | "vision",  // optional, default: "text"
//     "model":    "<model-name>",               // optional, overrides taskType
//     "messages": [                             // required
//       { "role": "user", "content": "Hello!" }
//     ]
//   }
// ──────────────────────────────────────────────────────────────────────────────

const ENDPOINT_NAME = 'ai-endpoint';

export default defineEndpoint({
  id: 'ai',
  handler: (router, apiContext) => {
    // Middleware: reject requests when the database schema is not yet ready.
    router.use(async (_req, res, next) => {
      try {
        const allTablesExist = await DatabaseInitializedCheck.checkAllTablesExistWithApiContext(
          ENDPOINT_NAME,
          apiContext
        );
        if (!allTablesExist) {
          return res.status(500).json({ error: 'Database not fully initialized' });
        }
        return next();
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return res.status(500).json({ error: 'Database initialization check failed', details: message });
      }
    });

    // ── GET /ai/models ────────────────────────────────────────────────────────
    router.get('/models', async (_req, res) => {
      try {
        const result = await OllamaHelper.listModels();
        return res.json(result);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return res.status(502).json({ error: 'Failed to reach Ollama service', details: message });
      }
    });

    // ── POST /ai/chat ─────────────────────────────────────────────────────────
    router.post('/chat', async (req, res) => {
      try {
        const { taskType, model, messages } = req.body as {
          taskType?: OllamaTaskType;
          model?: string;
          messages?: OllamaChatMessage[];
        };

        if (!Array.isArray(messages) || messages.length === 0) {
          return res.status(400).json({ error: 'Request body must contain a non-empty "messages" array' });
        }

        const result = await OllamaHelper.chat({ taskType, model, messages });
        return res.json(result);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return res.status(502).json({ error: 'Failed to reach Ollama service', details: message });
      }
    });
  },
});
