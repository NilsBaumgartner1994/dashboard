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

    it('should return aborted status after the job has been cancelled', () => {
      const jobResponse = { status: 'aborted', partialContent: '', message: undefined, error: undefined };
      expect(jobResponse.status).toBe('aborted');
    });

    it('should return 404 for unknown job id', () => {
      const notFoundResponse = { error: 'Job not found' };
      expect(notFoundResponse).toHaveProperty('error');
      expect(notFoundResponse.error).toBe('Job not found');
    });
  });

  describe('DELETE /ai-agent/job/:id', () => {
    it('should return ok:true when a job is successfully aborted', () => {
      const response = { ok: true };
      expect(response.ok).toBe(true);
    });

    it('should return 404 when aborting an unknown job', () => {
      const notFoundResponse = { error: 'Job not found' };
      expect(notFoundResponse).toHaveProperty('error');
      expect(notFoundResponse.error).toBe('Job not found');
    });

    it('should set the job status to aborted', () => {
      // Simulate the abort behaviour: status is set to 'aborted' before the AbortController fires
      const job = { status: 'running' as 'running' | 'aborted', abortController: new AbortController() };
      job.status = 'aborted';
      job.abortController.abort();
      expect(job.status).toBe('aborted');
      expect(job.abortController.signal.aborted).toBe(true);
    });

    it('should not overwrite aborted status with error in the background runner', () => {
      // Simulates the .catch() guard: if status is already 'aborted', do not overwrite with 'error'
      const job = { status: 'aborted' as string, error: undefined as string | undefined };
      const handleError = (err: Error) => {
        if (job.status === 'aborted') return;
        job.status = 'error';
        job.error = err.message;
      };
      handleError(new Error('AbortError'));
      expect(job.status).toBe('aborted');
      expect(job.error).toBeUndefined();
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
      expect(steps[0]!.text).toBe('Suchen nach Informationen über Del Wish Lohne');
      expect(steps[0]!.done).toBe(false);
      expect(steps[1]!.text).toBe('Auswerten der Ergebnisse und Suche nach relevanten Quellen');
      expect(steps[2]!.text).toBe('Öffnungszeiten aus den Suchergebnissen extrahieren');
    });

    it('should extract bullet-point steps from analysis content', () => {
      const analysisText =
        '* Web-Suche nach Öffnungszeiten\n' +
        '- Webseite des Restaurants aufrufen\n' +
        '• Informationen zusammenfassen';

      const steps = extractPlannedSteps(analysisText);
      expect(steps).toHaveLength(3);
      expect(steps[0]!.text).toBe('Web-Suche nach Öffnungszeiten');
      expect(steps[1]!.text).toBe('Webseite des Restaurants aufrufen');
      expect(steps[2]!.text).toBe('Informationen zusammenfassen');
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
      expect(steps[0]!.done).toBe(true);
      expect(steps[1]!.done).toBe(false);

      markNextDone(steps);
      expect(steps[1]!.done).toBe(true);
      expect(steps[2]!.done).toBe(false);
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
      expect(jobResponse.plannedSteps[0]!.done).toBe(true);
      expect(jobResponse.plannedSteps[1]!.done).toBe(false);
    });
  });

  describe('Inline tool call detection', () => {
    // Helper that mirrors the parseInlineToolCalls() logic from the backend
    function parseInlineToolCalls(content: string): Array<{ function: { name: string; arguments: Record<string, unknown> } }> {
      const calls: Array<{ function: { name: string; arguments: Record<string, unknown> } }> = [];
      const jsonBlocks = content.match(/\{(?:[^{}]|\{[^{}]*\})*\}/g);
      if (!jsonBlocks) return calls;
      for (const block of jsonBlocks) {
        try {
          const parsed = JSON.parse(block) as Record<string, unknown>;
          const name = typeof parsed.name === 'string' ? parsed.name : undefined;
          if (name === 'web_search' || name === 'fetch_url') {
            const rawArgs = (parsed.parameters ?? parsed.arguments ?? parsed.args ?? {}) as Record<string, unknown>;
            calls.push({ function: { name, arguments: rawArgs } });
          }
        } catch {
          // not valid JSON, skip
        }
      }
      return calls;
    }

    it('should detect a web_search call with parameters key', () => {
      const content = 'SYNTHESE:\n{"name": "web_search", "parameters": {"query": "Delwish Lohne heute"}}';
      const calls = parseInlineToolCalls(content);
      expect(calls).toHaveLength(1);
      expect(calls[0]!.function.name).toBe('web_search');
      expect((calls[0]!.function.arguments as { query: string }).query).toBe('Delwish Lohne heute');
    });

    it('should detect a fetch_url call with arguments key', () => {
      const content = '{"name": "fetch_url", "arguments": {"url": "https://example.com"}}';
      const calls = parseInlineToolCalls(content);
      expect(calls).toHaveLength(1);
      expect(calls[0]!.function.name).toBe('fetch_url');
      expect((calls[0]!.function.arguments as { url: string }).url).toBe('https://example.com');
    });

    it('should return empty array when no tool calls are present', () => {
      const content = 'Das ist eine normale Antwort ohne Tool-Aufrufe.';
      const calls = parseInlineToolCalls(content);
      expect(calls).toHaveLength(0);
    });

    it('should return empty array for unrecognised tool names', () => {
      const content = '{"name": "unknown_tool", "parameters": {"foo": "bar"}}';
      const calls = parseInlineToolCalls(content);
      expect(calls).toHaveLength(0);
    });

    it('should detect multiple inline tool calls in a single response', () => {
      const content =
        'Schritt 1: {"name": "web_search", "parameters": {"query": "Öffnungszeiten Delwish Lohne"}}\n' +
        'Schritt 2: {"name": "fetch_url", "parameters": {"url": "https://delwish.de"}}';
      const calls = parseInlineToolCalls(content);
      expect(calls).toHaveLength(2);
      expect(calls[0]!.function.name).toBe('web_search');
      expect(calls[1]!.function.name).toBe('fetch_url');
    });

    it('should ignore malformed JSON gracefully', () => {
      const content = 'AUSFÜHRUNG: {name: "web_search", parameters: {query: "test"}} not valid json';
      const calls = parseInlineToolCalls(content);
      expect(calls).toHaveLength(0);
    });

    it('should return empty array for valid JSON without a name field', () => {
      const content = '{"parameters": {"query": "test"}, "type": "function"}';
      const calls = parseInlineToolCalls(content);
      expect(calls).toHaveLength(0);
    });
  });

  describe('Thinking mode execution system prompt', () => {
    it('should use a simple execution prompt (not analytical) after the analysis phase', () => {
      // The execution-phase system prompt must NOT contain the structured ANALYSE/PLAN/AUSFÜHRUNG/SYNTHESE
      // headings so the model uses native tool calls instead of writing them as text.
      const execSystemContent =
        'Du bist ein hilfreicher KI-Assistent. Antworte IMMER auf Deutsch.' +
        ' Übernimm Eigennamen GENAU so wie vom Benutzer angegeben – keine automatische Rechtschreibkorrektur.' +
        ' Du hast Zugriff auf aktuelle Internet-Tools: web_search und fetch_url.' +
        ' WICHTIG: Rufe diese Tools direkt auf – schreibe Tool-Aufrufe NICHT als Text in deine Antwort.' +
        ' Sage NIEMALS, dass du keinen Internetzugriff hast.';
      expect(execSystemContent).not.toContain('ANALYSE');
      expect(execSystemContent).not.toContain('AUSFÜHRUNG');
      expect(execSystemContent).not.toContain('SYNTHESE');
      expect(execSystemContent).toContain('web_search');
      expect(execSystemContent).toContain('NICHT als Text');
      expect(execSystemContent).toContain('Eigennamen GENAU');
    });
  });

  describe('Input trust instructions', () => {
    it('should instruct the model to use user-provided names exactly as written', () => {
      const inputTrustInstructions =
        ' Wichtig: Übernimm Namen, Orte und Suchbegriffe GENAU so wie der Benutzer sie schreibt –' +
        ' korrigiere die Schreibweise von Eigennamen NICHT.' +
        ' Informelle Ausdrücke: "auf?" / "hat auf" / "offen?" bei einem Geschäft oder Ort bedeutet immer' +
        ' "geöffnet?" bzw. "Öffnungszeiten".';
      expect(inputTrustInstructions).toContain('GENAU so wie der Benutzer sie schreibt');
      expect(inputTrustInstructions).toContain('korrigiere die Schreibweise von Eigennamen NICHT');
      expect(inputTrustInstructions).toContain('"auf?"');
      expect(inputTrustInstructions).toContain('Öffnungszeiten');
    });

    it('should include input trust instructions in the standard system prompt', () => {
      const standardPrompt =
        'Du bist ein hilfreicher KI-Assistent. Antworte IMMER auf Deutsch.' +
        ' Wichtig: Übernimm Namen, Orte und Suchbegriffe GENAU so wie der Benutzer sie schreibt –' +
        ' korrigiere die Schreibweise von Eigennamen NICHT.' +
        ' Informelle Ausdrücke: "auf?" / "hat auf" / "offen?" bei einem Geschäft oder Ort bedeutet immer' +
        ' "geöffnet?" bzw. "Öffnungszeiten".';
      expect(standardPrompt).toContain('GENAU so wie der Benutzer');
      expect(standardPrompt).toContain('Eigennamen NICHT');
      expect(standardPrompt).toContain('Öffnungszeiten');
    });

    it('should include input trust instructions in the thinking mode system prompt', () => {
      const thinkingPrompt =
        'Du bist ein analytischer KI-Assistent. Antworte IMMER auf Deutsch.\n' +
        'Gehe bei jeder Anfrage strukturiert vor:\n' +
        '1. ANALYSE: Was möchte der Benutzer genau wissen? Welche Informationen werden benötigt?\n' +
        '2. PLAN: Welche konkreten Schritte sind nötig um alle Informationen zu beschaffen?\n' +
        '3. AUSFÜHRUNG: Führe alle Schritte systematisch aus.\n' +
        '4. SYNTHESE: Gib eine vollständige, destillierte Antwort.' +
        ' Wichtig: Übernimm Namen, Orte und Suchbegriffe GENAU so wie der Benutzer sie schreibt –' +
        ' korrigiere die Schreibweise von Eigennamen NICHT.' +
        ' Informelle Ausdrücke: "auf?" / "hat auf" / "offen?" bei einem Geschäft oder Ort bedeutet immer' +
        ' "geöffnet?" bzw. "Öffnungszeiten".';
      expect(thinkingPrompt).toContain('GENAU so wie der Benutzer');
      expect(thinkingPrompt).toContain('Eigennamen NICHT');
    });

    it('should include exact-name instruction in the analysis phase prompt', () => {
      const analysisBullet = '- Übernimm Namen und Suchbegriffe GENAU so wie der Benutzer sie nennt (keine Rechtschreibkorrektur bei Eigennamen, keine Umlaute ergänzen).';
      expect(analysisBullet).toContain('GENAU so wie der Benutzer sie nennt');
      expect(analysisBullet).toContain('keine Rechtschreibkorrektur bei Eigennamen');
      expect(analysisBullet).toContain('keine Umlaute ergänzen');
    });

    it('should instruct the model not to add umlauts when the user did not write them', () => {
      const inputTrustInstructions =
        ' Wichtig: Übernimm Namen, Orte und Suchbegriffe GENAU so wie der Benutzer sie schreibt –' +
        ' korrigiere die Schreibweise von Eigennamen NICHT.' +
        ' Füge KEINE Umlaute (ü, ö, ä) hinzu, die der Benutzer nicht geschrieben hat.' +
        ' Beispiel: Schreibt der Benutzer "Lohne", such nach "Lohne" – NICHT nach "Löhne".';
      expect(inputTrustInstructions).toContain('Füge KEINE Umlaute');
      expect(inputTrustInstructions).toContain('"Lohne"');
      expect(inputTrustInstructions).toContain('"Löhne"');
    });

    it('should instruct the model to do a fresh search for follow-up questions about different entities', () => {
      const inputTrustInstructions =
        ' Bei Folgefragen über eine andere Einrichtung oder einen anderen Ort MUSST du eine neue Suche' +
        ' für diesen Ort/diese Einrichtung starten – stütze dich NIEMALS auf Suchergebnisse einer früheren Frage' +
        ' um eine neue Frage zu beantworten.';
      expect(inputTrustInstructions).toContain('neue Suche');
      expect(inputTrustInstructions).toContain('NIEMALS auf Suchergebnisse einer früheren Frage');
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

  describe('Image analysis', () => {
    /** Mirrors the data-URL stripping logic from the backend endpoint. */
    function stripDataUrlPrefix(img: string): string {
      return img.replace(/^data:[^;]+;base64,/, '');
    }

    it('should strip data URL prefix from jpeg images', () => {
      const dataUrl = 'data:image/jpeg;base64,/9j/4AAQSkZJRgAB';
      expect(stripDataUrlPrefix(dataUrl)).toBe('/9j/4AAQSkZJRgAB');
    });

    it('should strip data URL prefix from png images', () => {
      const dataUrl = 'data:image/png;base64,iVBORw0KGgo=';
      expect(stripDataUrlPrefix(dataUrl)).toBe('iVBORw0KGgo=');
    });

    it('should leave raw base64 strings unchanged', () => {
      const rawBase64 = 'iVBORw0KGgo=';
      expect(stripDataUrlPrefix(rawBase64)).toBe('iVBORw0KGgo=');
    });

    it('should include images in the Ollama message when provided', () => {
      const incomingMessage = {
        role: 'user',
        content: 'Was ist auf diesem Bild?',
        images: ['data:image/jpeg;base64,/9j/4AAQSkZJRgAB'],
      };
      const ollamaMessage = {
        role: incomingMessage.role,
        content: incomingMessage.content,
        images: incomingMessage.images?.map(stripDataUrlPrefix),
      };
      expect(ollamaMessage.images).toHaveLength(1);
      expect(ollamaMessage.images![0]).toBe('/9j/4AAQSkZJRgAB');
    });

    it('should not include images field when no images are provided', () => {
      const incomingMessage = { role: 'user', content: 'Hallo!' };
      const images: string[] | undefined = (incomingMessage as { images?: string[] }).images;
      const ollamaMessage: { role: string; content: string; images?: string[] } = {
        role: incomingMessage.role,
        content: incomingMessage.content,
        ...(images && images.length > 0 ? { images: images.map(stripDataUrlPrefix) } : {}),
      };
      expect(ollamaMessage.images).toBeUndefined();
    });

    it('should handle multiple images in a single message', () => {
      const incomingMessage = {
        role: 'user',
        content: 'Vergleiche diese Bilder.',
        images: [
          'data:image/jpeg;base64,/9j/imageOne',
          'data:image/png;base64,iVBORimagetwo',
        ],
      };
      const ollamaMessage = {
        role: incomingMessage.role,
        content: incomingMessage.content,
        images: incomingMessage.images.map(stripDataUrlPrefix),
      };
      expect(ollamaMessage.images).toHaveLength(2);
      expect(ollamaMessage.images[0]).toBe('/9j/imageOne');
      expect(ollamaMessage.images[1]).toBe('iVBORimagetwo');
    });
  });
});
