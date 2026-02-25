import { defineEndpoint } from '@directus/extensions-sdk';
import type { Request, Response } from 'express';

// TTS endpoint – universal proxy to TTS model container.
// All requests to /tts/* are forwarded directly to the TTS container.
//
// This allows the TTS container to define all its own routes without
// needing to update this Directus extension for every new endpoint.

const TTS_URL = process.env.TTS_URL ?? 'http://localhost:8880';
const TTS_TIMEOUT_MS = 600_000; // 10 minutes for long-running TTS operations

export default defineEndpoint({
  id: 'tts',
  handler: (router) => {
    // Catch-all proxy: forwards all requests to the TTS container
    router.all('/*', async (req: Request, res: Response) => {
      try {
        const path = req.path; // e.g., "/health", "/generate", "/voices/create"
        const method = req.method;
        const ttsEndpoint = `${TTS_URL}${path}`;

        // Prepare headers to forward
        const headers: Record<string, string> = {};
        if (req.headers['content-type']) {
          headers['Content-Type'] = req.headers['content-type'] as string;
        }

        // Determine request body based on content type and method
        let requestBody: any = undefined;
        let timeout = TTS_TIMEOUT_MS;

        // Shorter timeout for health checks
        if (path === '/health') {
          timeout = 5000;
        }

        if (method === 'GET' || method === 'HEAD') {
          // No body for GET/HEAD
          requestBody = undefined;
        } else if (req.headers['content-type']?.includes('application/json')) {
          // JSON body - already parsed by Directus
          requestBody = JSON.stringify(req.body);
        } else if (req.headers['content-type']?.includes('multipart/form-data')) {
          // Multipart form data - forward raw request stream
          // @ts-ignore - req is a stream-like object
          requestBody = req;
        } else if (req.headers['content-type']?.includes('application/x-www-form-urlencoded')) {
          // Form data - convert to FormData
          const formData = new FormData();
          for (const [key, value] of Object.entries(req.body || {})) {
            formData.append(key, String(value));
          }
          requestBody = formData;
        } else if (req.body && Object.keys(req.body).length > 0) {
          // Fallback: convert body to FormData
          const formData = new FormData();
          for (const [key, value] of Object.entries(req.body)) {
            formData.append(key, String(value));
          }
          requestBody = formData;
        }

        // Forward request to TTS container
        const response = await fetch(ttsEndpoint, {
          method,
          headers,
          body: requestBody,
          // @ts-ignore - duplex needed for streaming
          duplex: requestBody === req ? 'half' : undefined,
          signal: AbortSignal.timeout(timeout),
        });

        // Check response content type
        const contentType = response.headers.get('content-type');

        if (!response.ok) {
          const errorBody = await response.text().catch(() => '');
          return res.status(response.status).json({
            error: `TTS returned ${response.status}: ${errorBody}`,
            path,
            method
          });
        }

        // Forward response based on content type
        if (contentType?.includes('application/json')) {
          const data = await response.json();

          // Special handling for /health to add ttsUrl info
          if (path === '/health') {
            return res.json({ ok: true, ttsUrl: TTS_URL, ...data });
          }

          return res.json(data);
        } else if (contentType?.includes('audio/')) {
          // Audio response - stream it back
          const audioBuffer = await response.arrayBuffer();
          const generationTime = response.headers.get('X-Generation-Time-Ms');
          res.setHeader('Content-Type', contentType);
          if (generationTime) res.setHeader('X-Generation-Time-Ms', generationTime);
          return res.send(Buffer.from(audioBuffer));
        } else {
          // Unknown content type - forward as-is
          const buffer = await response.arrayBuffer();
          if (contentType) res.setHeader('Content-Type', contentType);
          return res.send(Buffer.from(buffer));
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[TTS Proxy] Error for ${req.method} ${req.path}:`, message);
        return res.status(503).json({
          error: message,
          path: req.path,
          method: req.method
        });
      }
    });
  },
});
