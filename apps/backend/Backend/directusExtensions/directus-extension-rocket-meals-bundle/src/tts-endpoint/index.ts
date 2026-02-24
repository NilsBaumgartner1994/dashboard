import { defineEndpoint } from '@directus/extensions-sdk';

// TTS endpoint – proxies requests to the TTS model container.
//
// GET /tts/health
//   Returns: { ok: true, ttsUrl: string, status: string, model: string } or { ok: false, error: string }
//
// POST /tts/generate
//   Body: { "text": "...", "voice": "..." }   (voice is optional)
//   Returns: audio/wav binary

const TTS_URL = process.env.TTS_URL ?? 'http://localhost:8880';
const TTS_GENERATE_TIMEOUT_MS = 120_000; // 2 minutes

export default defineEndpoint({
  id: 'tts',
  handler: (router) => {
    // Health check – proxies to TTS container's /health endpoint
    router.get('/health', async (_req, res) => {
      try {
        const response = await fetch(`${TTS_URL}/health`, { signal: AbortSignal.timeout(5000) });
        if (!response.ok) {
          return res.status(502).json({ ok: false, error: `TTS returned ${response.status}`, ttsUrl: TTS_URL });
        }
        const data = (await response.json()) as Record<string, unknown>;
        return res.json({ ok: true, ttsUrl: TTS_URL, ...data });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return res.status(503).json({ ok: false, error: message, ttsUrl: TTS_URL });
      }
    });

    // TTS generate – proxies to TTS container's /tts/generate endpoint and streams the audio back
    router.post('/generate', async (req, res) => {
      try {
        const { text, voice } = req.body as { text?: string; voice?: string };
        if (!text || !text.trim()) {
          return res.status(400).json({ error: 'text must not be empty' });
        }

        const body: Record<string, unknown> = { text };
        if (voice) body.voice = voice;

        const response = await fetch(`${TTS_URL}/tts/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(TTS_GENERATE_TIMEOUT_MS),
        });

        if (!response.ok) {
          const errorBody = await response.text().catch(() => '');
          return res.status(response.status).json({ error: `TTS returned ${response.status}: ${errorBody}` });
        }

        const audioBuffer = await response.arrayBuffer();
        const generationTime = response.headers.get('X-Generation-Time-Ms');
        res.setHeader('Content-Type', 'audio/wav');
        if (generationTime) res.setHeader('X-Generation-Time-Ms', generationTime);
        return res.send(Buffer.from(audioBuffer));
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return res.status(503).json({ error: message });
      }
    });
  },
});
