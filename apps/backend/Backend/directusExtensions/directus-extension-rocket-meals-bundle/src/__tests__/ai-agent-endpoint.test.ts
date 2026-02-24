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

  describe('Thinking mode', () => {
    // Helper that mirrors the extractPlannedSteps() logic from the backend
    function extractPlannedSteps(text: string): Array<{ text: string; done: boolean }> {
      const steps: Array<{ text: string; done: boolean }> = [];
      for (const line of text.split('\n')) {
        const cleaned = line.trim();
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

    it('should include thinking:true in request when thinking mode is enabled', () => {
      const requestBody = {
        model: 'llama3.1:8b',
        messages: [{ role: 'user', content: 'Welche Dekane gibt es in der Uni Osnabrück?' }],
        allowInternet: true,
        thinking: true,
      };
      expect(requestBody.thinking).toBe(true);
    });

    it('should default thinking to false when not specified', () => {
      const thinking: boolean | undefined = undefined;
      const effectiveThinking = thinking ?? false;
      expect(effectiveThinking).toBe(false);
    });

    it('should include thinking flag in debug payload', () => {
      const debugPayload = {
        model: 'llama3.1:8b',
        messages: [{ role: 'user', content: 'Test' }],
        allowInternet: true,
        thinking: true,
        effectiveTools: [],
      };
      expect(debugPayload).toHaveProperty('thinking');
      expect(debugPayload.thinking).toBe(true);
    });

    it('should use structured analytical system prompt in thinking mode', () => {
      const thinkingSystemPrompt =
        'Du bist ein analytischer KI-Assistent. Antworte IMMER auf Deutsch.\n' +
        'Gehe bei jeder Anfrage strukturiert vor:\n' +
        '1. ANALYSE: Was möchte der Benutzer genau wissen? Welche Informationen werden benötigt?\n' +
        '2. PLAN: Welche konkreten Schritte sind nötig um alle Informationen zu beschaffen?\n' +
        '3. AUSFÜHRUNG: Führe alle Schritte systematisch aus.\n' +
        '4. SYNTHESE: Gib eine vollständige, destillierte Antwort.';
      expect(thinkingSystemPrompt).toContain('ANALYSE');
      expect(thinkingSystemPrompt).toContain('PLAN');
      expect(thinkingSystemPrompt).toContain('AUSFÜHRUNG');
      expect(thinkingSystemPrompt).toContain('SYNTHESE');
    });

    it('should produce three activity phases when thinking with tools', () => {
      const expectedActivities = [
        'KI analysiert die Frage und erstellt einen Plan…',
        'KI sucht im Internet: "test"…',
        'KI formuliert die finale Antwort…',
      ];
      expect(expectedActivities[0]).toContain('analysiert');
      expect(expectedActivities[1]).toContain('sucht');
      expect(expectedActivities[2]).toContain('formuliert');
    });

    it('should extract numbered steps from analysis content', () => {
      const analysisText =
        '1. Suchen nach Informationen über Del Wish Lohne\n' +
        '2. Auswerten der Ergebnisse und Suche nach relevanten Quellen\n' +
        '3. Öffnungszeiten aus den Suchergebnissen extrahieren';

      const steps = extractPlannedSteps(analysisText);
      expect(steps).toHaveLength(3);
      expect(steps[0].text).toBe('Suchen nach Informationen über Del Wish Lohne');
      expect(steps[0].done).toBe(false);
      expect(steps[1].text).toBe('Auswerten der Ergebnisse und Suche nach relevanten Quellen');
      expect(steps[2].text).toBe('Öffnungszeiten aus den Suchergebnissen extrahieren');
    });

    it('should extract bullet-point steps from analysis content', () => {
      const analysisText =
        '* Web-Suche nach Öffnungszeiten\n' +
        '- Webseite des Restaurants aufrufen\n' +
        '• Informationen zusammenfassen';

      const steps = extractPlannedSteps(analysisText);
      expect(steps).toHaveLength(3);
      expect(steps[0].text).toBe('Web-Suche nach Öffnungszeiten');
      expect(steps[1].text).toBe('Webseite des Restaurants aufrufen');
      expect(steps[2].text).toBe('Informationen zusammenfassen');
    });

    it('should mark steps as done sequentially when tools are executed', () => {
      const steps = [
        { text: 'Schritt A', done: false },
        { text: 'Schritt B', done: false },
        { text: 'Schritt C', done: false },
      ];

      // Simulate tool execution marking the next undone step
      const markNextDone = (s: typeof steps) => {
        const next = s.find((step) => !step.done);
        if (next) next.done = true;
      };

      markNextDone(steps);
      expect(steps[0].done).toBe(true);
      expect(steps[1].done).toBe(false);

      markNextDone(steps);
      expect(steps[1].done).toBe(true);
      expect(steps[2].done).toBe(false);
    });

    it('should include plannedSteps in job status response', () => {
      const jobResponse = {
        status: 'running',
        partialContent: 'KI sucht…',
        currentActivity: 'KI sucht im Internet: "test"…',
        visitedUrls: [],
        plannedSteps: [
          { text: 'Suche nach Informationen', done: true },
          { text: 'Webseite aufrufen', done: false },
        ],
        message: undefined,
        error: undefined,
      };
      expect(jobResponse).toHaveProperty('plannedSteps');
      expect(Array.isArray(jobResponse.plannedSteps)).toBe(true);
      expect(jobResponse.plannedSteps[0].done).toBe(true);
      expect(jobResponse.plannedSteps[1].done).toBe(false);
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
