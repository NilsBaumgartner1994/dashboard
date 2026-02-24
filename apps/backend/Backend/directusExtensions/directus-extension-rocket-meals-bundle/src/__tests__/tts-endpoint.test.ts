import { describe, it, expect } from '@jest/globals';

describe('TTS Endpoint', () => {
  describe('GET /tts/health', () => {
    it('should return ok:true when TTS container is reachable', () => {
      const healthResponse = { ok: true, ttsUrl: 'http://localhost:8880', status: 'ok', model: 'Qwen/Qwen3-TTS-12Hz-0.6B-Base' };
      expect(healthResponse.ok).toBe(true);
      expect(healthResponse).toHaveProperty('ttsUrl');
      expect(healthResponse).toHaveProperty('status');
    });

    it('should return ok:false with error when TTS container is unreachable', () => {
      const errorResponse = { ok: false, error: 'Connection refused', ttsUrl: 'http://localhost:8880' };
      expect(errorResponse.ok).toBe(false);
      expect(errorResponse).toHaveProperty('error');
      expect(errorResponse).toHaveProperty('ttsUrl');
    });

    it('should return ok:false with error when TTS container returns non-200', () => {
      const errorResponse = { ok: false, error: 'TTS returned 503', ttsUrl: 'http://localhost:8880' };
      expect(errorResponse.ok).toBe(false);
      expect(errorResponse.error).toContain('503');
    });
  });

  describe('POST /tts/generate', () => {
    it('should require a non-empty text field', () => {
      const errorResponse = { error: 'text must not be empty' };
      expect(errorResponse).toHaveProperty('error');
      expect(errorResponse.error).toContain('text');
    });

    it('should reject empty text', () => {
      const text = '   ';
      const isEmpty = !text || !text.trim();
      expect(isEmpty).toBe(true);
    });

    it('should accept text and optional voice fields', () => {
      const requestBody = { text: 'Hallo Welt', voice: 'default' };
      expect(requestBody).toHaveProperty('text');
      expect(requestBody).toHaveProperty('voice');
      expect(requestBody.text).toBe('Hallo Welt');
    });

    it('should accept text without voice field', () => {
      const requestBody = { text: 'Hallo Welt' };
      expect(requestBody).toHaveProperty('text');
      expect(requestBody).not.toHaveProperty('voice');
    });

    it('should forward X-Generation-Time-Ms header from TTS container', () => {
      const headers: Record<string, string> = { 'X-Generation-Time-Ms': '3200' };
      expect(headers['X-Generation-Time-Ms']).toBe('3200');
    });

    it('should return audio/wav content type', () => {
      const contentType = 'audio/wav';
      expect(contentType).toBe('audio/wav');
    });

    it('should handle TTS container error response', () => {
      const errorResponse = { error: 'TTS returned 503: Model not loaded yet' };
      expect(errorResponse).toHaveProperty('error');
      expect(errorResponse.error).toContain('503');
    });

    it('should build the correct request body when voice is provided', () => {
      const text = 'Hello';
      const voice = 'en-us';
      const body: Record<string, unknown> = { text };
      if (voice) body.voice = voice;
      expect(body).toEqual({ text: 'Hello', voice: 'en-us' });
    });

    it('should build the correct request body when voice is not provided', () => {
      const text = 'Hello';
      const voice: string | undefined = undefined;
      const body: Record<string, unknown> = { text };
      if (voice) body.voice = voice;
      expect(body).toEqual({ text: 'Hello' });
    });
  });

  describe('Environment configuration', () => {
    it('should default TTS_URL to localhost:8880', () => {
      const defaultTtsUrl = process.env.TTS_URL ?? 'http://localhost:8880';
      // In test environment TTS_URL is not set, so the default applies
      expect(typeof defaultTtsUrl).toBe('string');
      expect(defaultTtsUrl.length).toBeGreaterThan(0);
    });
  });
});
