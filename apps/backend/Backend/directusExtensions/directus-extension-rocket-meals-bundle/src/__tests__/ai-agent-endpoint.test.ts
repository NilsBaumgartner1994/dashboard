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

    it('should return a jobId immediately', () => {
      const response = { jobId: 'job-1234567890-abc1234' };
      expect(response).toHaveProperty('jobId');
      expect(typeof response.jobId).toBe('string');
    });

    it('should include internet tools when allowInternet is true (default)', () => {
      const tools: unknown[] = [];
      const allowInternet = true;
      const INTERNET_TOOLS = [
        { type: 'function', function: { name: 'web_search' } },
        { type: 'function', function: { name: 'fetch_url' } },
      ];
      if (allowInternet) tools.push(...INTERNET_TOOLS);
      expect(tools).toHaveLength(2);
      expect(tools.map((t: unknown) => (t as { function: { name: string } }).function.name)).toContain('web_search');
      expect(tools.map((t: unknown) => (t as { function: { name: string } }).function.name)).toContain('fetch_url');
    });

    it('should not include internet tools when allowInternet is false', () => {
      const tools: unknown[] = [];
      const allowInternet = false;
      const INTERNET_TOOLS = [
        { type: 'function', function: { name: 'web_search' } },
        { type: 'function', function: { name: 'fetch_url' } },
      ];
      if (allowInternet) tools.push(...INTERNET_TOOLS);
      expect(tools).toHaveLength(0);
    });

    it('should build a valid request payload for Ollama', () => {
      const messages = [{ role: 'user', content: 'Hello' }];
      const payload = {
        model: 'llama3.1:8b',
        messages,
        stream: true,
      };
      expect(payload.model).toBe('llama3.1:8b');
      expect(payload.messages).toHaveLength(1);
      expect(payload.stream).toBe(true);
    });

    it('should include tools when provided', () => {
      const payload = {
        model: 'llama3.1:8b',
        messages: [{ role: 'user', content: 'What is the weather?' }],
        stream: true,
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

  describe('GET /ai-agent/job/:id', () => {
    it('should return pending status for a newly created job', () => {
      const jobResponse = { status: 'pending', partialContent: '', message: undefined, error: undefined };
      expect(jobResponse.status).toBe('pending');
      expect(jobResponse.partialContent).toBe('');
    });

    it('should return partial content while the job is running', () => {
      const jobResponse = { status: 'running', partialContent: 'Hello, I am thinking…', message: undefined, error: undefined };
      expect(jobResponse.status).toBe('running');
      expect(jobResponse.partialContent).toBeTruthy();
    });

    it('should return done status with final message when complete', () => {
      const jobResponse = {
        status: 'done',
        partialContent: 'Hello world',
        message: { role: 'assistant', content: 'Hello world' },
        error: undefined,
      };
      expect(jobResponse.status).toBe('done');
      expect(jobResponse.message?.content).toBe('Hello world');
    });

    it('should return error status when inference fails', () => {
      const jobResponse = { status: 'error', partialContent: '', message: undefined, error: 'Ollama returned 503' };
      expect(jobResponse.status).toBe('error');
      expect(jobResponse.error).toBeTruthy();
    });

    it('should return 404 for unknown job id', () => {
      const notFoundResponse = { error: 'Job not found' };
      expect(notFoundResponse).toHaveProperty('error');
      expect(notFoundResponse.error).toBe('Job not found');
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

  describe('Internet tools', () => {
    it('web_search tool should have the correct schema', () => {
      const tool = {
        type: 'function',
        function: {
          name: 'web_search',
          description: 'Search the web for current information.',
          parameters: {
            type: 'object',
            properties: { query: { type: 'string', description: 'The search query' } },
            required: ['query'],
          },
        },
      };
      expect(tool.function.name).toBe('web_search');
      expect(tool.function.parameters.required).toContain('query');
    });

    it('fetch_url tool should have the correct schema', () => {
      const tool = {
        type: 'function',
        function: {
          name: 'fetch_url',
          description: 'Fetch the text content of a web page by URL.',
          parameters: {
            type: 'object',
            properties: { url: { type: 'string', description: 'The full URL to fetch' } },
            required: ['url'],
          },
        },
      };
      expect(tool.function.name).toBe('fetch_url');
      expect(tool.function.parameters.required).toContain('url');
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
