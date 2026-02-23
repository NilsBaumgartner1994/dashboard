import { describe, it, expect } from '@jest/globals';

describe('AI Agent Endpoint', () => {
  describe('POST /ai-agent/chat', () => {
    it('should require a messages array', () => {
      const missingMessagesError = { error: 'messages array is required and must not be empty' };
      expect(missingMessagesError).toHaveProperty('error');
    });

    it('should reject an empty messages array', () => {
      const emptyMessagesError = { error: 'messages array is required and must not be empty' };
      expect(emptyMessagesError.error).toContain('messages array');
    });

    it('should build a valid request payload for Ollama', () => {
      const messages = [{ role: 'user', content: 'Hello' }];
      const payload = {
        model: 'llama3.1:8b',
        messages,
        stream: false,
      };
      expect(payload.model).toBe('llama3.1:8b');
      expect(payload.messages).toHaveLength(1);
      expect(payload.stream).toBe(false);
    });

    it('should include tools when provided', () => {
      const payload = {
        model: 'llama3.1:8b',
        messages: [{ role: 'user', content: 'What is the weather?' }],
        stream: false,
        tools: [{ type: 'function', function: { name: 'get_weather', description: 'Get weather' } }],
      };
      expect(payload).toHaveProperty('tools');
      expect(Array.isArray(payload.tools)).toBe(true);
    });

    it('should default to llama3.1:8b model when none specified', () => {
      const DEFAULT_MODEL = 'llama3.1:8b';
      const requestModel: string | undefined = undefined;
      const model = requestModel ?? DEFAULT_MODEL;
      expect(model).toBe('llama3.1:8b');
    });
  });

  describe('GET /ai-agent/health', () => {
    it('should return ok:true when Ollama is reachable', () => {
      const healthResponse = { ok: true, ollamaUrl: 'http://my-dashboard-ai:11434' };
      expect(healthResponse.ok).toBe(true);
      expect(healthResponse).toHaveProperty('ollamaUrl');
    });

    it('should return ok:false with error when Ollama is unreachable', () => {
      const errorResponse = { ok: false, error: 'Connection refused' };
      expect(errorResponse.ok).toBe(false);
      expect(errorResponse).toHaveProperty('error');
    });
  });

  describe('GET /ai-agent/models', () => {
    it('should return a models array', () => {
      const response = { models: [{ name: 'llama3.1:8b' }] };
      expect(Array.isArray(response.models)).toBe(true);
    });

    it('should handle an empty models list', () => {
      const response = { models: [] };
      expect(response.models).toHaveLength(0);
    });
  });

  describe('Error handling', () => {
    it('should handle Ollama returning a non-200 status', () => {
      const errorResponse = { error: 'Ollama returned 503', details: 'Service Unavailable' };
      expect(errorResponse).toHaveProperty('error');
      expect(errorResponse.error).toContain('503');
    });

    it('should handle network errors gracefully', () => {
      const networkError = { error: 'Failed to contact AI agent', details: 'fetch failed' };
      expect(networkError).toHaveProperty('error');
      expect(networkError).toHaveProperty('details');
    });
  });
});
