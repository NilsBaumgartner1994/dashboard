# Qwen3-TTS API (CPU)

Local text-to-speech service based on Qwen3-TTS models.

## CPU-only + multiple models

Der Container läuft **rein auf CPU** und lädt beim Start standardmäßig beide Modelle:

- `Qwen/Qwen3-TTS-12Hz-0.6B-Base`
- `Qwen/Qwen3-TTS-1.7B-Base`

Beide bleiben lokal im Cache (`./data/tts-models`) und werden bei Neustarts wiederverwendet.

## Hugging Face Token

Für die beiden Default-Modelle ist **kein Token nötig** (öffentlich).

Optional für private/gated Modelle:

```dotenv
HUGGING_FACE_HUB_TOKEN=hf_...
```

## Quick start

```bash
docker-compose up my-dashboard-tts-cpu
```

## Umgebungsvariablen

| Variable | Default | Beschreibung |
|---|---|---|
| `TTS_MODEL_ID` | `Qwen/Qwen3-TTS-12Hz-0.6B-Base` | Fallback/Default Modell-ID |
| `TTS_MODEL_IDS` | `Qwen/Qwen3-TTS-12Hz-0.6B-Base,Qwen/Qwen3-TTS-1.7B-Base` | Komma-getrennte Liste aller beim Start zu ladenden Modelle |
| `TTS_DEFAULT_MODEL_ID` | `Qwen/Qwen3-TTS-12Hz-0.6B-Base` | Standardmodell, wenn kein `model_id` in Request übergeben wird |
| `HUGGING_FACE_HUB_TOKEN` | *(leer)* | Optionaler HF Token |

## Endpoints

- `GET /health`
  - Liefert Status + geladene/supported Modelle.
- `POST /tts/generate`
  - Aktuell unterstützt: `mode=voice_design`.
  - Request-Felder:
    - `text` (required)
    - `voice` (optional)
    - `model_id` (optional)
    - `mode` (optional, default `voice_design`)
    - `reference_audio_base64`, `reference_text` (optional, bereits für zukünftiges Voice-Clone-Handling vorgesehen)
