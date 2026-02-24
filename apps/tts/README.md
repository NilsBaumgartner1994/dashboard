# Qwen3-TTS API (CPU)

Local text-to-speech service based on [Qwen/Qwen3-TTS-12Hz-0.6B-Base](https://huggingface.co/Qwen/Qwen3-TTS-12Hz-0.6B-Base).

## Wo wird das Modell heruntergeladen? / Where is the model downloaded from?

Das Modell wird beim **ersten Start des Containers automatisch vom [Hugging Face Hub](https://huggingface.co/Qwen/Qwen3-TTS-12Hz-0.6B-Base)** heruntergeladen.

- **Kein API-Key erforderlich** – `Qwen/Qwen3-TTS-12Hz-0.6B-Base` ist ein öffentliches Modell.
- Die Modelldateien werden im Docker-Volume `./data/tts-models/` gespeichert und beim nächsten Start wiederverwendet (kein erneuter Download notwendig).
- Benötigter Speicherplatz: ca. **1–2 GB** für das 0.6B-Modell.

---

*The model is downloaded automatically from Hugging Face Hub on the first container start.*
*No API key is required – it is a public model.*
*Files are cached in `./data/tts-models/` and reused on subsequent starts.*

## Optional: Hugging Face Token

Ein Token wird für dieses Modell **nicht benötigt**. Falls du ein privates oder gated Modell verwenden möchtest, kannst du optional einen Token setzen:

```dotenv
# .env
HUGGING_FACE_HUB_TOKEN=hf_...
```

Der Token wird automatisch an den Container weitergereicht und von der `transformers`-Bibliothek verwendet.

## Schnellstart / Quick start

```bash
# Nur TTS starten (CPU-Profil)
docker-compose --profile cpu up my-dashboard-tts-cpu

# Oder manuell bauen und starten
docker build -t qwen3-tts-api-cpu --target cpu-base ./apps/tts
docker run -p 8880:8880 -v "$(pwd)/data/tts-models:/root/.cache/huggingface" qwen3-tts-api-cpu
```

## Umgebungsvariablen / Environment variables

| Variable | Standard / Default | Beschreibung |
|---|---|---|
| `TTS_MODEL_ID` | `Qwen/Qwen3-TTS-12Hz-0.6B-Base` | HuggingFace-Modell-ID |
| `HUGGING_FACE_HUB_TOKEN` | *(leer / empty)* | HF-Token für private/gated Modelle |
| `TTS_MEMORY` | `4g` | Docker-Speicherlimit für den Container |

## Endpunkte / Endpoints

| Method | Path | Beschreibung |
|---|---|---|
| `GET` | `/health` | Gibt `{"status": "ok", "model": "..."}` zurück, sobald das Modell geladen ist |
| `POST` | `/tts/generate` | Generiert Audio; Body: `{"text": "..."}` → WAV-Datei |

Der Response-Header `X-Generation-Time-Ms` enthält die Generierungszeit in Millisekunden.
