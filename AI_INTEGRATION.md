# AI Agent Integration

This document explains the chosen approach for running a free, self-hosted AI agent
inside the Docker stack and how each use-case (text analysis, code generation,
image understanding) is covered.

---

## Decision: Ollama

[Ollama](https://ollama.com/) was chosen as the AI runtime because it:

| Criterion | Detail |
|---|---|
| **Cost** | Completely free and open-source – no API keys, no usage fees |
| **Docker-native** | Official image `ollama/ollama`; CPU-only by default, GPU opt-in |
| **OpenAI-compatible API** | Drop-in replacement for `openai` npm SDK (just change `baseURL`) |
| **Model variety** | Supports hundreds of models via a single `ollama pull <name>` command |
| **Network isolation** | Container is attached only to `directus_network`; not reachable from the internet |

---

## Network Architecture

```
Internet / Frontend
        │
        ▼
   Traefik (proxy)
        │
        ▼
  Directus (backend)  ──────────────►  Ollama :11434
        │                              (directus_network only)
        ▼
  Redis (cache)
```

Ollama has **no exposed host ports**.  All AI requests go through the
`/my-dashboard/api/ai/*` Directus endpoint.

---

## Supported Use-Cases

### 1. Text Analysis

Model: `llama3.2` (default) or `mistral`

```
POST /my-dashboard/api/ai/chat
{
  "taskType": "text",
  "messages": [
    { "role": "user", "content": "Summarise the following article: ..." }
  ]
}
```

### 2. Code Generation

Model: `deepseek-coder-v2` (default) or `codellama`

```
POST /my-dashboard/api/ai/chat
{
  "taskType": "code",
  "messages": [
    { "role": "user", "content": "Write a TypeScript function that sorts an array of objects by date." }
  ]
}
```

### 3. Image Understanding (Vision / Multimodal)

Model: `llava` (default)

Pass an image as a base64 data URL or a public URL in the message content:

```
POST /my-dashboard/api/ai/chat
{
  "taskType": "vision",
  "messages": [
    {
      "role": "user",
      "content": [
        { "type": "text", "text": "What does this image show?" },
        { "type": "image_url", "image_url": { "url": "data:image/png;base64,..." } }
      ]
    }
  ]
}
```

### 4. Image Generation (Text-to-Image)

> **Not yet implemented.**  Ollama handles image *understanding* only.
>
> For text-to-image generation, consider adding one of these services to the stack:
>
> | Option | Docker Image | Notes |
> |---|---|---|
> | **ComfyUI** | `ghcr.io/ai-dock/comfyui` | Modular, supports SDXL, Flux |
> | **AUTOMATIC1111** | `ghcr.io/automatic1111/stable-diffusion-webui` | Most popular Stable Diffusion UI |
> | **InvokeAI** | `ghcr.io/invoke-ai/invokeai` | Professional-grade, REST API |
>
> All three are free and can be kept internal to `directus_network` the same
> way Ollama is.  A GPU is strongly recommended for acceptable performance.

---

## Available API Routes

| Method | Path | Description |
|---|---|---|
| `GET` | `/my-dashboard/api/ai/models` | List models pulled on the Ollama instance |
| `POST` | `/my-dashboard/api/ai/chat` | Chat / completion request |

---

## Configuration

Environment variables (see `env.template`):

| Variable | Default | Description |
|---|---|---|
| `OLLAMA_MODEL_TEXT` | `llama3.2` | Model used for text analysis |
| `OLLAMA_MODEL_CODE` | `deepseek-coder-v2` | Model used for code generation |
| `OLLAMA_MODEL_VISION` | `llava` | Model used for image understanding |

The `OLLAMA_BASE_URL` is hardcoded to `http://my-dashboard-ollama:11434` inside
the backend docker-compose and should not need changing.

---

## Pulling Models

Models are **not bundled** in the image.  Pull them once with:

```bash
docker exec my-dashboard-ollama ollama pull llama3.2
docker exec my-dashboard-ollama ollama pull deepseek-coder-v2
docker exec my-dashboard-ollama ollama pull llava
```

Pulled models are stored in `./data/ollama` (a named volume mount) and survive
container restarts.

### Recommended Models by Hardware

| Use-case | Tiny (≤ 4 GB RAM) | Mid (8 GB RAM) | Large (16+ GB RAM) |
|---|---|---|---|
| Text analysis | `phi3:mini` | `llama3.2` | `llama3.1:8b` |
| Code generation | `qwen2.5-coder:1.5b` | `deepseek-coder-v2` | `deepseek-coder-v2:16b` |
| Vision | `llava:7b` | `llava` | `llava:13b` |

---

## GPU Acceleration (optional)

> **Prerequisites (host machine)**
> 1. Install the [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html).
> 2. Restart the Docker daemon: `sudo systemctl restart docker`.
> 3. Verify with: `docker run --rm --gpus all nvidia/cuda:12.0-base-ubuntu20.04 nvidia-smi`.

To enable NVIDIA GPU pass-through, add the following to the `my-dashboard-ollama`
service in `docker-compose.yaml`:

```yaml
deploy:
  resources:
    reservations:
      devices:
        - driver: nvidia
          count: all
          capabilities: [gpu]
```

No other changes are required – Ollama auto-detects CUDA/ROCm at startup.
