# coding=utf-8
# Qwen3-TTS FastAPI Server
# Provides TTS endpoints for Voice Design, Voice Clone, and CustomVoice

import os
import io
import base64
import numpy as np
import torch
import asyncio
import threading
import sys
import traceback
from pathlib import Path
from fastapi import FastAPI, HTTPException, UploadFile, File, Form, Body
from fastapi.responses import JSONResponse, StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from huggingface_hub import snapshot_download, login
from qwen_tts import Qwen3TTSModel
import soundfile as sf

# ============================================================================
# CONFIGURE HUGGINGFACE CACHE LOCATION
# ============================================================================
# Set HuggingFace cache to /data/tts-models instead of ~/.cache
project_root = Path(__file__).parent.parent.parent  # Goes up to /dashboard
hf_cache_dir = project_root / "data" / "tts-models"
hf_cache_dir.mkdir(parents=True, exist_ok=True)

os.environ["HF_HOME"] = str(hf_cache_dir)
print(f"HuggingFace cache directory: {hf_cache_dir}")

# ============================================================================
# CONFIGURE VOICES DIRECTORY FOR VOICE CLONE TRAINING
# ============================================================================
voices_dir = project_root / "data" / "tts-voices"
voices_dir.mkdir(parents=True, exist_ok=True)
print(f"TTS Voices directory: {voices_dir}")

# HF_TOKEN = os.environ.get('HF_TOKEN')
# login(token=HF_TOKEN)

# Model size options
MODEL_SIZES = ["0.6B", "1.7B"]

# Speaker and language choices for CustomVoice model
SPEAKERS = [
    "Aiden", "Dylan", "Eric", "Ono_anna", "Ryan", "Serena", "Sohee", "Uncle_fu", "Vivian"
]
LANGUAGES = ["Auto", "Chinese", "English", "Japanese", "Korean", "French", "German", "Spanish", "Portuguese", "Russian"]

# Optional: Configure which models to load via environment variables
# Default: load all models
LOAD_VOICE_DESIGN = os.environ.get("LOAD_VOICE_DESIGN", "true").lower() == "true"
LOAD_BASE_MODELS = os.environ.get("LOAD_BASE_MODELS", "true").lower() == "true"
LOAD_CUSTOM_VOICE_MODELS = os.environ.get("LOAD_CUSTOM_VOICE_MODELS", "false").lower() == "true"

print(f"Model loading configuration:")
print(f"  LOAD_VOICE_DESIGN: {LOAD_VOICE_DESIGN}")
print(f"  LOAD_BASE_MODELS: {LOAD_BASE_MODELS}")
print(f"  LOAD_CUSTOM_VOICE_MODELS: {LOAD_CUSTOM_VOICE_MODELS}")

# Global model state
class ModelState:
    def __init__(self):
        self.voice_design_model = None
        self.base_model_0_6b = None
        self.base_model_1_7b = None
        self.custom_voice_model_0_6b = None
        self.custom_voice_model_1_7b = None
        self.models_loaded = False
        self.loading = False
        self.error = None
        # Time estimation table: stores (char_count, word_count, duration_seconds)
        self.time_estimation_data = []

    @property
    def BASE_MODELS(self):
        return {
            "0.6B": self.base_model_0_6b,
            "1.7B": self.base_model_1_7b,
        }

    @property
    def CUSTOM_VOICE_MODELS(self):
        return {
            "0.6B": self.custom_voice_model_0_6b,
            "1.7B": self.custom_voice_model_1_7b,
        }

    def add_estimation_data(self, char_count: int, word_count: int, duration: float):
        """Add a generation record for time estimation."""
        self.time_estimation_data.append({
            'char_count': char_count,
            'word_count': word_count,
            'duration': duration,
        })

    def estimate_generation_time(self, char_count: int, word_count: int) -> float:
        """Estimate generation time based on historical data."""
        if not self.time_estimation_data:
            # No data yet, return a default estimate (e.g., 0.1s per character)
            return char_count * 0.1

        # Calculate average duration per character and per word
        total_chars = sum(d['char_count'] for d in self.time_estimation_data)
        total_words = sum(d['word_count'] for d in self.time_estimation_data)
        total_duration = sum(d['duration'] for d in self.time_estimation_data)

        avg_per_char = total_duration / total_chars if total_chars > 0 else 0.1
        avg_per_word = total_duration / total_words if total_words > 0 else 0.5

        # Use both metrics and average them
        estimate_by_chars = char_count * avg_per_char
        estimate_by_words = word_count * avg_per_word

        # Weighted average: prefer character-based for now
        return (estimate_by_chars * 0.7 + estimate_by_words * 0.3)

model_state = ModelState()

# FastAPI app
app = FastAPI(title="Qwen3-TTS API", version="1.0.0")

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def get_voice_path(voice_name: str) -> Path:
    """Get the directory path for a specific voice."""
    return voices_dir / voice_name

def voice_exists(voice_name: str) -> bool:
    """Check if a voice profile exists."""
    voice_path = get_voice_path(voice_name)
    return voice_path.exists() and voice_path.is_dir()

def get_reference_audio_path(voice_name: str) -> Path:
    """Get the path for the reference audio file."""
    return get_voice_path(voice_name) / "reference_audio.wav"

def get_training_data_path(voice_name: str) -> Path:
    """Get the path for the training data/embeddings file."""
    return get_voice_path(voice_name) / "training_data.pt"

def list_voices() -> list:
    """List all available voice profiles."""
    voices = []
    if voices_dir.exists():
        for voice_dir in voices_dir.iterdir():
            if voice_dir.is_dir():
                voices.append({
                    "name": voice_dir.name,
                    "has_reference_audio": get_reference_audio_path(voice_dir.name).exists(),
                    "has_training_data": get_training_data_path(voice_dir.name).exists(),
                })
    return sorted(voices, key=lambda v: v["name"])

def create_voice(voice_name: str, ref_audio_bytes: bytes, ref_audio_sr: int) -> dict:
    """Create a new voice profile with reference audio."""
    # Validate voice name
    if not voice_name or not voice_name.strip():
        raise ValueError("Voice name cannot be empty")

    voice_name = voice_name.strip()
    if voice_exists(voice_name):
        raise ValueError(f"Voice '{voice_name}' already exists")

    voice_path = get_voice_path(voice_name)
    voice_path.mkdir(parents=True, exist_ok=True)

    # Save reference audio
    ref_audio_path = get_reference_audio_path(voice_name)
    with open(ref_audio_path, "wb") as f:
        f.write(ref_audio_bytes)

    print(f"[INFO] Created voice '{voice_name}' with reference audio at {ref_audio_path}")

    return {
        "name": voice_name,
        "has_reference_audio": True,
        "has_training_data": False,
    }

def delete_voice(voice_name: str) -> bool:
    """Delete a voice profile."""
    voice_path = get_voice_path(voice_name)
    if not voice_path.exists():
        raise ValueError(f"Voice '{voice_name}' does not exist")

    # Delete all files in the voice directory
    import shutil
    shutil.rmtree(voice_path)
    print(f"[INFO] Deleted voice '{voice_name}'")
    return True


def get_model_path(model_type: str, model_size: str) -> str:
    """Get model path based on type and size."""
    return snapshot_download(f"Qwen/Qwen3-TTS-12Hz-{model_size}-{model_type}")


# ============================================================================
# BACKGROUND MODEL LOADING WITH RETRY
# ============================================================================
MAX_RETRIES = 3
RETRY_DELAY_SECONDS = 5

def load_single_model(model_name: str, model_type: str, model_size: str, max_retries: int = MAX_RETRIES):
    """
    Load a single model with retry logic.

    Returns:
        The loaded model if successful, None otherwise
    """
    for attempt in range(1, max_retries + 1):
        try:
            if attempt > 1:
                print(f"  ↻ Retry {attempt}/{max_retries} for {model_name}...")
                import time
                time.sleep(RETRY_DELAY_SECONDS)

            print(f"  → Downloading model path...")
            model_path = get_model_path(model_type, model_size)
            print(f"  → Model path: {model_path}")
            print(f"  → Creating model from pretrained...")

            model = Qwen3TTSModel.from_pretrained(
                model_path,
                device_map="cpu",
                dtype=torch.float32,
                attn_implementation="eager",
            )

            print(f"✓ {model_name} loaded successfully")
            return model

        except Exception as e:
            print(f"✗ Error loading {model_name} (attempt {attempt}/{max_retries}): {type(e).__name__}: {e}", file=sys.stderr)
            traceback.print_exc(file=sys.stderr)

            if attempt == max_retries:
                print(f"⚠ Failed to load {model_name} after {max_retries} attempts. Continuing without this model.", file=sys.stderr)
                return None

    return None


def load_models_background():
    """Load all models sequentially in background thread with retry logic."""
    model_state.loading = True
    print("Loading all models sequentially with retry on failure...")
    print(f"Configuration: Max retries per model: {MAX_RETRIES}, Retry delay: {RETRY_DELAY_SECONDS}s\n")

    # Voice Design model (1.7B only)
    if LOAD_VOICE_DESIGN:
        print("=" * 60)
        print("Loading VoiceDesign 1.7B model...")
        print("=" * 60)
        model_state.voice_design_model = load_single_model(
            "VoiceDesign 1.7B",
            "VoiceDesign",
            "1.7B"
        )
    else:
        print("⊘ Skipping VoiceDesign 1.7B (disabled)")

    # Base (Voice Clone) models
    if LOAD_BASE_MODELS:
        # Load 0.6B model
        print("\n" + "=" * 60)
        print("Loading Base 0.6B model...")
        print("=" * 60)
        model_state.base_model_0_6b = load_single_model(
            "Base 0.6B",
            "Base",
            "0.6B"
        )

        # Load 1.7B model
        print("\n" + "=" * 60)
        print("Loading Base 1.7B model...")
        print("=" * 60)
        model_state.base_model_1_7b = load_single_model(
            "Base 1.7B",
            "Base",
            "1.7B"
        )
    else:
        print("⊘ Skipping Base models (disabled)")

    # CustomVoice models
    if LOAD_CUSTOM_VOICE_MODELS:
        # Load 0.6B model
        print("\n" + "=" * 60)
        print("Loading CustomVoice 0.6B model...")
        print("=" * 60)
        model_state.custom_voice_model_0_6b = load_single_model(
            "CustomVoice 0.6B",
            "CustomVoice",
            "0.6B"
        )

        # Load 1.7B model
        print("\n" + "=" * 60)
        print("Loading CustomVoice 1.7B model...")
        print("=" * 60)
        model_state.custom_voice_model_1_7b = load_single_model(
            "CustomVoice 1.7B",
            "CustomVoice",
            "1.7B"
        )
    else:
        print("⊘ Skipping CustomVoice models (disabled)")

    # Summary
    print("\n" + "=" * 60)
    print("✓ Model loading process completed!")
    print("=" * 60)

    loaded_models = []
    if model_state.voice_design_model:
        loaded_models.append("VoiceDesign 1.7B")
    if model_state.base_model_0_6b:
        loaded_models.append("Base 0.6B")
    if model_state.base_model_1_7b:
        loaded_models.append("Base 1.7B")
    if model_state.custom_voice_model_0_6b:
        loaded_models.append("CustomVoice 0.6B")
    if model_state.custom_voice_model_1_7b:
        loaded_models.append("CustomVoice 1.7B")

    if loaded_models:
        print("Successfully loaded models:")
        for model_name in loaded_models:
            print(f"  ✓ {model_name}")
    else:
        print("⚠ No models were successfully loaded!")

    print(f"Total: {len(loaded_models)} model(s) loaded")
    print("=" * 60 + "\n")

    # Mark as loaded even if some models failed
    # This allows the API to be partially functional
    model_state.models_loaded = len(loaded_models) > 0
    model_state.loading = False

    if not model_state.models_loaded:
        model_state.error = "Failed to load any models after multiple retries"


# Start background loading thread
print("Starting model loading in background thread...")
model_loading_thread = threading.Thread(target=load_models_background, daemon=True)
model_loading_thread.start()

# ============================================================================


def _normalize_audio(wav, eps=1e-12, clip=True):
    """Normalize audio to float32 in [-1, 1] range."""
    x = np.asarray(wav)

    if np.issubdtype(x.dtype, np.integer):
        info = np.iinfo(x.dtype)
        if info.min < 0:
            y = x.astype(np.float32) / max(abs(info.min), info.max)
        else:
            mid = (info.max + 1) / 2.0
            y = (x.astype(np.float32) - mid) / mid
    elif np.issubdtype(x.dtype, np.floating):
        y = x.astype(np.float32)
        m = np.max(np.abs(y)) if y.size else 0.0
        if m > 1.0 + 1e-6:
            y = y / (m + eps)
    else:
        raise TypeError(f"Unsupported dtype: {x.dtype}")

    if clip:
        y = np.clip(y, -1.0, 1.0)

    if y.ndim > 1:
        y = np.mean(y, axis=-1).astype(np.float32)

    return y


def _audio_to_wav_bytes(wav, sr):
    """Convert audio to WAV bytes."""
    buffer = io.BytesIO()
    sf.write(buffer, wav, sr, format='WAV')
    buffer.seek(0)
    return buffer.getvalue()


# ============================================================================
# HEALTH CHECK ENDPOINT
# ============================================================================
@app.get("/health")
async def health_check():
    """Health check endpoint."""
    if model_state.error:
        return {
            "status": "error",
            "message": f"Error loading models: {model_state.error}",
            "models_loaded": False,
            "loading": model_state.loading
        }
    return {
        "status": "ok",
        "message": "Qwen3-TTS API is running",
        "models_loaded": model_state.models_loaded,
        "loading": model_state.loading
    }


def check_models_loaded():
    """Check if models are loaded, raise HTTPException if not."""
    if model_state.error:
        raise HTTPException(status_code=503, detail=f"Models failed to load: {model_state.error}")
    if not model_state.models_loaded:
        raise HTTPException(status_code=503, detail="Models are still loading. Please try again in a moment.")


@app.get("/models")
async def get_available_models():
    """Get available models and configurations."""
    return {
        "model_sizes": MODEL_SIZES,
        "speakers": SPEAKERS,
        "languages": LANGUAGES,
        "models_loaded": model_state.models_loaded,
        "loading": model_state.loading,
        "voices": list_voices(),
        "endpoints": {
            "voice_design": "/voice-design",
            "voice_clone": "/voice-clone",
            "custom_voice": "/custom-voice",
            "voices": "/voices",
            "voices_create": "/voices/create",
            "voices_delete": "/voices/delete",
            "estimate_time": "/estimate-time",
        }
    }


@app.post("/estimate-time")
async def estimate_generation_time(request_body: dict = Body(...)):
    """
    Estimate generation time for a given text.

    Request body:
    {
        "text": "Text to estimate generation time for"
    }

    Returns:
    {
        "estimated_seconds": float,
        "char_count": int,
        "word_count": int
    }
    """
    text = request_body.get("text", "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="text field is required")

    char_count = len(text)
    word_count = len(text.split())

    estimated_time = model_state.estimate_generation_time(char_count, word_count)

    return {
        "estimated_seconds": round(estimated_time, 2),
        "char_count": char_count,
        "word_count": word_count,
    }


# ============================================================================
# VOICE DESIGN ENDPOINT (1.7B only)
# ============================================================================
@app.post("/voice-design")
async def voice_design_endpoint(
    text: str = Form(...),
    language: str = Form("Auto"),
    voice_description: str = Form(...),
):
    """
    Generate speech using Voice Design model (1.7B only).

    Parameters:
    - text: Text to synthesize
    - language: Language (default: Auto)
    - voice_description: Description of the desired voice characteristics
    """
    check_models_loaded()

    if not text or not text.strip():
        raise HTTPException(status_code=400, detail="Text is required.")
    if not voice_description or not voice_description.strip():
        raise HTTPException(status_code=400, detail="Voice description is required.")

    import time
    start_time = time.time()

    try:
        wavs, sr = model_state.voice_design_model.generate_voice_design(
            text=text.strip(),
            language=language,
            instruct=voice_description.strip(),
            non_streaming_mode=True,
            max_new_tokens=2048,
        )

        wav_bytes = _audio_to_wav_bytes(wavs[0], sr)

        # Track generation time
        generation_time = time.time() - start_time
        char_count = len(text.strip())
        word_count = len(text.strip().split())
        model_state.add_estimation_data(char_count, word_count, generation_time)

        return StreamingResponse(
            iter([wav_bytes]),
            media_type="audio/wav",
            headers={
                "Content-Disposition": "attachment; filename=voice_design.wav",
                "X-Generation-Time-Ms": str(int(generation_time * 1000))
            }
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error: {type(e).__name__}: {e}")


@app.post("/voice-design/base64")
async def voice_design_base64_endpoint(
    text: str = Form(...),
    language: str = Form("Auto"),
    voice_description: str = Form(...),
):
    """
    Generate speech using Voice Design model and return as base64.

    Parameters:
    - text: Text to synthesize
    - language: Language (default: Auto)
    - voice_description: Description of the desired voice characteristics
    """
    check_models_loaded()

    if not text or not text.strip():
        raise HTTPException(status_code=400, detail="Text is required.")
    if not voice_description or not voice_description.strip():
        raise HTTPException(status_code=400, detail="Voice description is required.")

    try:
        wavs, sr = model_state.voice_design_model.generate_voice_design(
            text=text.strip(),
            language=language,
            instruct=voice_description.strip(),
            non_streaming_mode=True,
            max_new_tokens=2048,
        )

        wav_bytes = _audio_to_wav_bytes(wavs[0], sr)
        wav_base64 = base64.b64encode(wav_bytes).decode('utf-8')

        return JSONResponse({
            "audio": wav_base64,
            "format": "wav",
            "sample_rate": sr,
            "message": "Voice design generation completed successfully!"
        })
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error: {type(e).__name__}: {e}")


# ============================================================================
# UNIFIED GENERATE ENDPOINT (for Directus integration)
# ============================================================================
@app.post("/generate")
@app.post("/tts/generate")
async def generate_endpoint(request_body: dict = Body(...)):
    """
    Unified TTS generation endpoint for Directus integration.

    Request body can contain:
    {
        "text": "Text to synthesize (required)",
        "voice": "Speaker name (optional, default: Ryan)",
        "model_id": "Model ID (optional)",
        "mode": "voice_design|voice_clone|custom_voice (optional, default: custom_voice)",
        "language": "Language (optional, default: English)",
        "reference_audio_base64": "Base64 audio for voice clone (optional)",
        "reference_text": "Text for voice clone reference (optional)"
    }

    Returns: audio/wav binary
    """
    check_models_loaded()

    try:
        # Debug: Log the request body type and content
        print(f"[DEBUG] Request body type: {type(request_body)}", file=sys.stderr)
        print(f"[DEBUG] Request body: {request_body}", file=sys.stderr)

        # Ensure request_body is a dict
        if not isinstance(request_body, dict):
            print(f"[ERROR] Expected dict, got {type(request_body).__name__}", file=sys.stderr)
            raise HTTPException(status_code=400, detail=f"Invalid request body type: {type(request_body).__name__}, expected dict")

        text = request_body.get("text", "").strip()
        if not text:
            raise HTTPException(status_code=400, detail="text field is required and must not be empty")

        mode = request_body.get("mode", "custom_voice").lower()
        voice = request_body.get("voice", "Ryan")
        language = request_body.get("language", "English")
        model_id_str = request_body.get("model_id", "1.7B")

        # Safely extract model size
        try:
            model_size = str(model_id_str).split("-")[-1]
        except Exception as e:
            print(f"[WARNING] Failed to parse model_id: {model_id_str}, using default 1.7B", file=sys.stderr)
            model_size = "1.7B"

        # Validate model size
        if model_size not in MODEL_SIZES:
            model_size = "1.7B"

        print(f"[INFO] TTS Request: text_len={len(text)}, mode={mode}, voice={voice}, language={language}, model_size={model_size}", file=sys.stderr)

        try:
            wavs = None
            sr = None

            if mode == "voice_clone" and model_state.base_model_1_7b:
                # Voice Clone mode
                ref_audio_b64 = request_body.get("reference_audio_base64")
                ref_text = request_body.get("reference_text", "")

                if not ref_audio_b64:
                    raise HTTPException(status_code=400, detail="voice_clone mode requires reference_audio_base64")

                # Decode base64 audio
                try:
                    audio_bytes = base64.b64decode(ref_audio_b64)
                    audio_buffer = io.BytesIO(audio_bytes)
                    wav, sr = sf.read(audio_buffer)
                    wav = _normalize_audio(wav)
                    audio_tuple = (wav, int(sr))
                except Exception as e:
                    raise HTTPException(status_code=400, detail=f"Failed to decode reference audio: {e}")

                tts = model_state.BASE_MODELS[model_size]
                wavs, sr = tts.generate_voice_clone(
                    text=text,
                    language=language,
                    ref_audio=audio_tuple,
                    ref_text=ref_text.strip() if ref_text else None,
                    x_vector_only_mode=not ref_text,
                    max_new_tokens=2048,
                )

            elif mode == "voice_design" and model_state.voice_design_model:
                # Voice Design mode
                voice_description = request_body.get("voice", "A natural, clear voice")
                print(f"[INFO] Generating VoiceDesign: '{text[:50]}...' with description: '{voice_description}'", file=sys.stderr)
                wavs, sr = model_state.voice_design_model.generate_voice_design(
                    text=text,
                    language=language,
                    instruct=voice_description,
                    non_streaming_mode=True,
                    max_new_tokens=2048,
                )
                print(f"[INFO] VoiceDesign generation completed", file=sys.stderr)

            elif mode == "voice_design" and not model_state.voice_design_model:
                # Voice Design not available, fallback to custom_voice
                print(f"[WARNING] VoiceDesign not loaded, falling back to custom_voice mode", file=sys.stderr)
                mode = "custom_voice"

            # Custom Voice mode (default) or fallback from voice_design
            if mode == "custom_voice":
                if model_state.custom_voice_model_1_7b:
                    # Use CustomVoice if available
                    tts = model_state.CUSTOM_VOICE_MODELS[model_size]

                    # Validate speaker
                    if voice not in SPEAKERS:
                        print(f"[WARNING] Speaker '{voice}' not in SPEAKERS, using 'Ryan'", file=sys.stderr)
                        voice = "Ryan"  # Default speaker

                    print(f"[INFO] Generating CustomVoice: speaker={voice}, text='{text[:50]}...'", file=sys.stderr)
                    wavs, sr = tts.generate_custom_voice(
                        text=text,
                        language=language,
                        speaker=voice.lower().replace(" ", "_"),
                        instruct=request_body.get("instruction", ""),
                        non_streaming_mode=True,
                        max_new_tokens=2048,
                    )
                    print(f"[INFO] CustomVoice generation completed", file=sys.stderr)
                elif model_state.base_model_1_7b:
                    # Fallback to Base model for simple TTS if CustomVoice not available
                    print(f"[INFO] Using Base model with x_vector_only mode", file=sys.stderr)

                    # Create a dummy ref_audio to satisfy the interface
                    # Generate a short silence as reference
                    dummy_audio = np.zeros(16000)  # 1 second of silence at 16kHz

                    prompt = model_state.base_model_1_7b.create_voice_clone_prompt(
                        ref_audio=(dummy_audio, 16000),
                        x_vector_only_mode=True
                    )

                    wavs, sr = model_state.base_model_1_7b.generate_voice_clone(
                        text=text,
                        language=language,
                        voice_clone_prompt=prompt,
                        non_streaming_mode=True,
                        max_new_tokens=2048,
                    )
                    print(f"[INFO] Base model generation completed", file=sys.stderr)
                else:
                    raise HTTPException(status_code=503, detail="No TTS models available")

            if wavs is None or sr is None:
                raise HTTPException(status_code=500, detail="Failed to generate audio")

            print(f"[INFO] Audio generated successfully: sr={sr}, shape={wavs.shape if hasattr(wavs, 'shape') else 'N/A'}", file=sys.stderr)
            wav_bytes = _audio_to_wav_bytes(wavs[0], sr)

            return StreamingResponse(
                iter([wav_bytes]),
                media_type="audio/wav",
                headers={"Content-Disposition": "attachment; filename=generated.wav"}
            )
        except HTTPException:
            raise
        except Exception as e:
            print(f"[ERROR] Generation failed: {type(e).__name__}: {e}", file=sys.stderr)
            traceback.print_exc(file=sys.stderr)
            raise HTTPException(status_code=500, detail=f"Error: {type(e).__name__}: {e}")

    except HTTPException:
        raise
    except Exception as e:
        print(f"[FATAL ERROR] Unexpected error in /generate endpoint: {type(e).__name__}: {e}", file=sys.stderr)
        traceback.print_exc(file=sys.stderr)
        raise HTTPException(status_code=500, detail=f"Unexpected error: {type(e).__name__}: {e}")


# ============================================================================
# VOICE CLONE ENDPOINT
# ============================================================================
@app.post("/voice-clone")
async def voice_clone_endpoint(
    ref_audio: UploadFile = File(...),
    ref_text: str = Form(...),
    target_text: str = Form(...),
    language: str = Form("Auto"),
    use_xvector_only: bool = Form(False),
    model_size: str = Form("1.7B"),
):
    """
    Generate speech using Voice Clone (Base) model.

    Parameters:
    - ref_audio: Reference audio file to clone
    - ref_text: Transcript of the reference audio (optional if use_xvector_only=true)
    - target_text: Text to synthesize with cloned voice
    - language: Language (default: Auto)
    - use_xvector_only: Use x-vector only mode (lower quality, no ref_text needed)
    - model_size: Model size ("0.6B" or "1.7B", default: "1.7B")
    """
    check_models_loaded()

    if not target_text or not target_text.strip():
        raise HTTPException(status_code=400, detail="Target text is required.")

    if model_size not in MODEL_SIZES:
        raise HTTPException(status_code=400, detail=f"Model size must be one of {MODEL_SIZES}")

    if not use_xvector_only and (not ref_text or not ref_text.strip()):
        raise HTTPException(status_code=400, detail="Reference text is required when 'Use x-vector only' is not enabled.")

    import time
    start_time = time.time()

    try:
        # Read the uploaded audio file
        audio_content = await ref_audio.read()
        audio_buffer = io.BytesIO(audio_content)
        wav, sr = sf.read(audio_buffer)
        wav = _normalize_audio(wav)
        audio_tuple = (wav, int(sr))

        tts = model_state.BASE_MODELS[model_size]
        wavs, sr = tts.generate_voice_clone(
            text=target_text.strip(),
            language=language,
            ref_audio=audio_tuple,
            ref_text=ref_text.strip() if ref_text else None,
            x_vector_only_mode=use_xvector_only,
            max_new_tokens=2048,
        )

        wav_bytes = _audio_to_wav_bytes(wavs[0], sr)

        # Track generation time
        generation_time = time.time() - start_time
        char_count = len(target_text.strip())
        word_count = len(target_text.strip().split())
        model_state.add_estimation_data(char_count, word_count, generation_time)

        return StreamingResponse(
            iter([wav_bytes]),
            media_type="audio/wav",
            headers={
                "Content-Disposition": "attachment; filename=voice_clone.wav",
                "X-Generation-Time-Ms": str(int(generation_time * 1000))
            }
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error: {type(e).__name__}: {e}")


@app.post("/voice-clone/base64")
async def voice_clone_base64_endpoint(
    ref_audio: UploadFile = File(...),
    ref_text: str = Form(...),
    target_text: str = Form(...),
    language: str = Form("Auto"),
    use_xvector_only: bool = Form(False),
    model_size: str = Form("1.7B"),
):
    """
    Generate speech using Voice Clone (Base) model and return as base64.
    """
    check_models_loaded()

    if not target_text or not target_text.strip():
        raise HTTPException(status_code=400, detail="Target text is required.")

    if model_size not in MODEL_SIZES:
        raise HTTPException(status_code=400, detail=f"Model size must be one of {MODEL_SIZES}")

    if not use_xvector_only and (not ref_text or not ref_text.strip()):
        raise HTTPException(status_code=400, detail="Reference text is required when 'Use x-vector only' is not enabled.")

    try:
        # Read the uploaded audio file
        audio_content = await ref_audio.read()
        audio_buffer = io.BytesIO(audio_content)
        wav, sr = sf.read(audio_buffer)
        wav = _normalize_audio(wav)
        audio_tuple = (wav, int(sr))

        tts = model_state.BASE_MODELS[model_size]
        wavs, sr = tts.generate_voice_clone(
            text=target_text.strip(),
            language=language,
            ref_audio=audio_tuple,
            ref_text=ref_text.strip() if ref_text else None,
            x_vector_only_mode=use_xvector_only,
            max_new_tokens=2048,
        )

        wav_bytes = _audio_to_wav_bytes(wavs[0], sr)
        wav_base64 = base64.b64encode(wav_bytes).decode('utf-8')

        return JSONResponse({
            "audio": wav_base64,
            "format": "wav",
            "sample_rate": sr,
            "message": "Voice clone generation completed successfully!"
        })
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error: {type(e).__name__}: {e}")


# ============================================================================
# CUSTOM VOICE ENDPOINT
# ============================================================================
@app.post("/custom-voice")
async def custom_voice_endpoint(
    text: str = Form(...),
    language: str = Form("English"),
    speaker: str = Form(...),
    instruct: str = Form(""),
    model_size: str = Form("1.7B"),
):
    """
    Generate speech using CustomVoice model with predefined speakers.

    Parameters:
    - text: Text to synthesize
    - language: Language (default: English)
    - speaker: Speaker name (one of the predefined speakers)
    - instruct: Style instruction (optional)
    - model_size: Model size ("0.6B" or "1.7B", default: "1.7B")
    """
    check_models_loaded()

    if not text or not text.strip():
        raise HTTPException(status_code=400, detail="Text is required.")
    if not speaker:
        raise HTTPException(status_code=400, detail="Speaker is required.")

    if speaker not in SPEAKERS:
        raise HTTPException(status_code=400, detail=f"Speaker must be one of {SPEAKERS}")

    if model_size not in MODEL_SIZES:
        raise HTTPException(status_code=400, detail=f"Model size must be one of {MODEL_SIZES}")

    import time
    start_time = time.time()

    try:
        tts = model_state.CUSTOM_VOICE_MODELS[model_size]
        wavs, sr = tts.generate_custom_voice(
            text=text.strip(),
            language=language,
            speaker=speaker.lower().replace(" ", "_"),
            instruct=instruct.strip() if instruct else None,
            non_streaming_mode=True,
            max_new_tokens=2048,
        )

        wav_bytes = _audio_to_wav_bytes(wavs[0], sr)

        # Track generation time
        generation_time = time.time() - start_time
        char_count = len(text.strip())
        word_count = len(text.strip().split())
        model_state.add_estimation_data(char_count, word_count, generation_time)

        return StreamingResponse(
            iter([wav_bytes]),
            media_type="audio/wav",
            headers={
                "Content-Disposition": "attachment; filename=custom_voice.wav",
                "X-Generation-Time-Ms": str(int(generation_time * 1000))
            }
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error: {type(e).__name__}: {e}")


@app.post("/custom-voice/base64")
async def custom_voice_base64_endpoint(
    text: str = Form(...),
    language: str = Form("English"),
    speaker: str = Form(...),
    instruct: str = Form(""),
    model_size: str = Form("1.7B"),
):
    """
    Generate speech using CustomVoice model and return as base64.
    """
    check_models_loaded()

    if not text or not text.strip():
        raise HTTPException(status_code=400, detail="Text is required.")
    if not speaker:
        raise HTTPException(status_code=400, detail="Speaker is required.")

    if speaker not in SPEAKERS:
        raise HTTPException(status_code=400, detail=f"Speaker must be one of {SPEAKERS}")

    if model_size not in MODEL_SIZES:
        raise HTTPException(status_code=400, detail=f"Model size must be one of {MODEL_SIZES}")

    try:
        tts = model_state.CUSTOM_VOICE_MODELS[model_size]
        wavs, sr = tts.generate_custom_voice(
            text=text.strip(),
            language=language,
            speaker=speaker.lower().replace(" ", "_"),
            instruct=instruct.strip() if instruct else None,
            non_streaming_mode=True,
            max_new_tokens=2048,
        )

        wav_bytes = _audio_to_wav_bytes(wavs[0], sr)
        wav_base64 = base64.b64encode(wav_bytes).decode('utf-8')

        return JSONResponse({
            "audio": wav_base64,
            "format": "wav",
            "sample_rate": sr,
            "message": "CustomVoice generation completed successfully!"
        })
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error: {type(e).__name__}: {e}")


# ============================================================================
# VOICE MANAGEMENT ENDPOINTS
# ============================================================================

@app.get("/voices")
async def list_all_voices():
    """Get list of all available voice profiles."""
    return {
        "voices": list_voices()
    }


@app.post("/voices/create")
async def create_voice_endpoint(
    voice_name: str = Form(...),
    reference_audio: UploadFile = File(...),
):
    """
    Create a new voice profile with reference audio for voice cloning.

    Parameters:
    - voice_name: Name of the new voice (must be unique)
    - reference_audio: Audio file to use as reference for voice cloning
    """
    try:
        # Read reference audio
        audio_content = await reference_audio.read()
        audio_buffer = io.BytesIO(audio_content)
        wav, sr = sf.read(audio_buffer)
        wav = _normalize_audio(wav)

        # Create voice profile
        voice_info = create_voice(voice_name, audio_content, sr)

        print(f"[INFO] Voice '{voice_name}' created successfully", file=sys.stderr)
        return {
            "success": True,
            "voice": voice_info
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        print(f"[ERROR] Failed to create voice: {type(e).__name__}: {e}", file=sys.stderr)
        traceback.print_exc(file=sys.stderr)
        raise HTTPException(status_code=500, detail=f"Error: {type(e).__name__}: {e}")


@app.post("/voices/delete")
async def delete_voice_endpoint(voice_name: str = Form(...)):
    """
    Delete a voice profile and all its associated data.

    Parameters:
    - voice_name: Name of the voice to delete
    """
    try:
        delete_voice(voice_name)
        print(f"[INFO] Voice '{voice_name}' deleted successfully", file=sys.stderr)
        return {
            "success": True,
            "message": f"Voice '{voice_name}' deleted"
        }
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        print(f"[ERROR] Failed to delete voice: {type(e).__name__}: {e}", file=sys.stderr)
        traceback.print_exc(file=sys.stderr)
        raise HTTPException(status_code=500, detail=f"Error: {type(e).__name__}: {e}")


@app.post("/voices/clone")
async def clone_voice_with_training(
    voice_name: str = Form(...),
    text: str = Form(...),
    language: str = Form("Auto"),
    model_size: str = Form("1.7B"),
):
    """
    Clone a voice using a saved voice profile for voice cloning.

    Parameters:
    - voice_name: Name of the saved voice to use
    - text: Text to synthesize
    - language: Language (default: Auto)
    - model_size: Model size ("0.6B" or "1.7B", default: "1.7B")
    """
    check_models_loaded()

    if not text or not text.strip():
        raise HTTPException(status_code=400, detail="Text is required")

    if not voice_exists(voice_name):
        raise HTTPException(status_code=404, detail=f"Voice '{voice_name}' not found")

    if not get_reference_audio_path(voice_name).exists():
        raise HTTPException(status_code=400, detail=f"Voice '{voice_name}' has no reference audio")

    if model_size not in MODEL_SIZES:
        raise HTTPException(status_code=400, detail=f"Model size must be one of {MODEL_SIZES}")

    import time
    start_time = time.time()

    try:
        print(f"[INFO] Cloning voice: voice_name={voice_name}, text='{text[:50]}...', model_size={model_size}", file=sys.stderr)

        # Load reference audio
        ref_audio_path = get_reference_audio_path(voice_name)
        wav, sr = sf.read(ref_audio_path)
        wav = _normalize_audio(wav)
        audio_tuple = (wav, int(sr))

        # Use Base model for voice cloning
        tts = model_state.BASE_MODELS[model_size]
        # Generate speech using voice clone
        wavs, sr = tts.generate_voice_clone(
            text=text.strip(),
            language=language,
            ref_audio=audio_tuple,
            ref_text=None,  # Use x_vector_only mode
            x_vector_only_mode=True,
            max_new_tokens=2048,
        )

        if wavs is None:
            raise HTTPException(status_code=500, detail="Failed to generate audio")

        print(f"[INFO] Voice cloning completed for '{voice_name}'", file=sys.stderr)
        wav_bytes = _audio_to_wav_bytes(wavs[0], sr)

        # Track generation time
        generation_time = time.time() - start_time
        char_count = len(text.strip())
        word_count = len(text.strip().split())
        model_state.add_estimation_data(char_count, word_count, generation_time)

        return StreamingResponse(
            iter([wav_bytes]),
            media_type="audio/wav",
            headers={
                "Content-Disposition": f"attachment; filename=voice-clone-{voice_name}.wav",
                "X-Generation-Time-Ms": str(int(generation_time * 1000))
            }
        )
        wav = _normalize_audio(wav)
        audio_tuple = (wav, int(sr))

        # Use Base model for voice cloning
        tts = model_state.BASE_MODELS[model_size]

        # Generate speech using voice clone
        wavs, sr = tts.generate_voice_clone(
            text=text.strip(),
            language=language,
            ref_audio=audio_tuple,
            ref_text=None,  # Use x_vector_only mode
            x_vector_only_mode=True,
            max_new_tokens=2048,
        )

        if wavs is None:
            raise HTTPException(status_code=500, detail="Failed to generate audio")

        print(f"[INFO] Voice cloning completed for '{voice_name}'", file=sys.stderr)
        wav_bytes = _audio_to_wav_bytes(wavs[0], sr)

        return StreamingResponse(
            iter([wav_bytes]),
            media_type="audio/wav",
            headers={"Content-Disposition": f"attachment; filename=voice-clone-{voice_name}.wav"}
        )
    except HTTPException:
        raise
    except Exception as e:
        print(f"[ERROR] Voice cloning failed: {type(e).__name__}: {e}", file=sys.stderr)
        traceback.print_exc(file=sys.stderr)
        raise HTTPException(status_code=500, detail=f"Error: {type(e).__name__}: {e}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8880)

