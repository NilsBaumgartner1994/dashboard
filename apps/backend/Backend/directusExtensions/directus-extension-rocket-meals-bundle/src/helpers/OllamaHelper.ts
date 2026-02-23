import OpenAI from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { EnvVariableHelper } from './EnvVariableHelper';

/**
 * Helper for communicating with the local Ollama service.
 *
 * Ollama exposes an OpenAI-compatible REST API at port 11434, so the existing
 * `openai` npm package can be reused – only the `baseURL` changes.
 *
 * Available task types:
 *  - "text"   → general text analysis / summarisation (OLLAMA_MODEL_TEXT)
 *  - "code"   → code generation / explanation        (OLLAMA_MODEL_CODE)
 *  - "vision" → image understanding (multimodal)     (OLLAMA_MODEL_VISION)
 *
 * Note: image *generation* (text-to-image) requires a separate service such as
 * Stable Diffusion / ComfyUI.  Ollama handles image *understanding* only.
 */
export type OllamaTaskType = 'text' | 'code' | 'vision';

/** Subset of OpenAI's ChatCompletionMessageParam that Ollama also accepts. */
export type OllamaChatMessage = ChatCompletionMessageParam;

export interface OllamaChatOptions {
  taskType?: OllamaTaskType;
  /** Override the model name directly. */
  model?: string;
  messages: OllamaChatMessage[];
  stream?: false;
}

export interface OllamaChatResult {
  model: string;
  content: string;
}

export class OllamaHelper {
  private static getClient(): OpenAI {
    const baseURL = `${EnvVariableHelper.getOllamaBaseUrl()}/v1`;
    return new OpenAI({
      baseURL,
      // Ollama does not require an API key; a placeholder satisfies the SDK.
      apiKey: 'ollama',
    });
  }

  private static resolveModel(options: OllamaChatOptions): string {
    if (options.model) {
      return options.model;
    }
    switch (options.taskType) {
      case 'code':
        return EnvVariableHelper.getOllamaModelCode();
      case 'vision':
        return EnvVariableHelper.getOllamaModelVision();
      case 'text':
      default:
        return EnvVariableHelper.getOllamaModelText();
    }
  }

  /**
   * Send a chat completion request to Ollama and return the assistant reply.
   * Throws when Ollama returns no choices or an empty message.
   */
  static async chat(options: OllamaChatOptions): Promise<OllamaChatResult> {
    const client = OllamaHelper.getClient();
    const model = OllamaHelper.resolveModel(options);

    const completion = await client.chat.completions.create({
      model,
      messages: options.messages,
      stream: false,
    });

    const content = completion.choices[0]?.message?.content;
    if (content == null) {
      throw new Error('Ollama returned no content in the completion response');
    }
    return { model, content };
  }

  /**
   * List all models currently available on the local Ollama instance.
   * Returns the raw JSON from GET /api/tags.
   */
  static async listModels(): Promise<{ models: Array<{ name: string; size: number; modified_at: string }> }> {
    const baseUrl = EnvVariableHelper.getOllamaBaseUrl();
    const response = await fetch(`${baseUrl}/api/tags`);
    if (!response.ok) {
      throw new Error(`Ollama /api/tags returned HTTP ${response.status}`);
    }
    return response.json() as Promise<{ models: Array<{ name: string; size: number; modified_at: string }> }>;
  }
}
