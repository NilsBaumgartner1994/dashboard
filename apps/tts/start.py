# coding=utf-8
# Qwen3-TTS FastAPI Server
# Provides TTS endpoints for Voice Design, Voice Clone, and CustomVoice

import os
import io
import base64
import numpy as np
import torch
from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.responses import JSONResponse, StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from huggingface_hub import snapshot_download, login
from qwen_tts import Qwen3TTSModel
import soundfile as sf

# HF_TOKEN = os.environ.get('HF_TOKEN')
# login(token=HF_TOKEN)

# Model size options
MODEL_SIZES = ["0.6B", "1.7B"]

# Speaker and language choices for CustomVoice model
SPEAKERS = [
    "Aiden", "Dylan", "Eric", "Ono_anna", "Ryan", "Serena", "Sohee", "Uncle_fu", "Vivian"
]
LANGUAGES = ["Auto", "Chinese", "English", "Japanese", "Korean", "French", "German", "Spanish", "Portuguese", "Russian"]

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


def get_model_path(model_type: str, model_size: str) -> str:
    """Get model path based on type and size."""
    return snapshot_download(f"Qwen/Qwen3-TTS-12Hz-{model_size}-{model_type}")


# ============================================================================
# GLOBAL MODEL LOADING - Load all models at startup
# ============================================================================
print("Loading all models to CUDA...")

# Voice Design model (1.7B only)
print("Loading VoiceDesign 1.7B model...")
voice_design_model = Qwen3TTSModel.from_pretrained(
    get_model_path("VoiceDesign", "1.7B"),
    device_map="cuda",
    dtype=torch.bfloat16,
    # token=HF_TOKEN,
    attn_implementation="kernels-community/flash-attn3",
)

# Base (Voice Clone) models - both sizes
print("Loading Base 0.6B model...")
base_model_0_6b = Qwen3TTSModel.from_pretrained(
    get_model_path("Base", "0.6B"),
    device_map="cuda",
    dtype=torch.bfloat16,
    # token=HF_TOKEN,
    attn_implementation="kernels-community/flash-attn3",
)

print("Loading Base 1.7B model...")
base_model_1_7b = Qwen3TTSModel.from_pretrained(
    get_model_path("Base", "1.7B"),
    device_map="cuda",
    dtype=torch.bfloat16,
    # token=HF_TOKEN,
    attn_implementation="kernels-community/flash-attn3",
)

# CustomVoice models - both sizes
print("Loading CustomVoice 0.6B model...")
custom_voice_model_0_6b = Qwen3TTSModel.from_pretrained(
    get_model_path("CustomVoice", "0.6B"),
    device_map="cuda",
    dtype=torch.bfloat16,
    # token=HF_TOKEN,
    attn_implementation="kernels-community/flash-attn3",
)

print("Loading CustomVoice 1.7B model...")
custom_voice_model_1_7b = Qwen3TTSModel.from_pretrained(
    get_model_path("CustomVoice", "1.7B"),
    device_map="cuda",
    dtype=torch.bfloat16,
    # token=HF_TOKEN,
    attn_implementation="kernels-community/flash-attn3",
)

print("All models loaded successfully!")

# Model lookup dictionaries for easy access
BASE_MODELS = {
    "0.6B": base_model_0_6b,
    "1.7B": base_model_1_7b,
}

CUSTOM_VOICE_MODELS = {
    "0.6B": custom_voice_model_0_6b,
    "1.7B": custom_voice_model_1_7b,
}

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
    return {"status": "ok", "message": "Qwen3-TTS API is running"}


@app.get("/models")
async def get_available_models():
    """Get available models and configurations."""
    return {
        "model_sizes": MODEL_SIZES,
        "speakers": SPEAKERS,
        "languages": LANGUAGES,
        "endpoints": {
            "voice_design": "/voice-design",
            "voice_clone": "/voice-clone",
            "custom_voice": "/custom-voice"
        }
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
    if not text or not text.strip():
        raise HTTPException(status_code=400, detail="Text is required.")
    if not voice_description or not voice_description.strip():
        raise HTTPException(status_code=400, detail="Voice description is required.")

    try:
        wavs, sr = voice_design_model.generate_voice_design(
            text=text.strip(),
            language=language,
            instruct=voice_description.strip(),
            non_streaming_mode=True,
            max_new_tokens=2048,
        )

        wav_bytes = _audio_to_wav_bytes(wavs[0], sr)

        return StreamingResponse(
            iter([wav_bytes]),
            media_type="audio/wav",
            headers={"Content-Disposition": "attachment; filename=voice_design.wav"}
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
    if not text or not text.strip():
        raise HTTPException(status_code=400, detail="Text is required.")
    if not voice_description or not voice_description.strip():
        raise HTTPException(status_code=400, detail="Voice description is required.")

    try:
        wavs, sr = voice_design_model.generate_voice_design(
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

        tts = BASE_MODELS[model_size]
        wavs, sr = tts.generate_voice_clone(
            text=target_text.strip(),
            language=language,
            ref_audio=audio_tuple,
            ref_text=ref_text.strip() if ref_text else None,
            x_vector_only_mode=use_xvector_only,
            max_new_tokens=2048,
        )

        wav_bytes = _audio_to_wav_bytes(wavs[0], sr)

        return StreamingResponse(
            iter([wav_bytes]),
            media_type="audio/wav",
            headers={"Content-Disposition": "attachment; filename=voice_clone.wav"}
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

        tts = BASE_MODELS[model_size]
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
    if not text or not text.strip():
        raise HTTPException(status_code=400, detail="Text is required.")
    if not speaker:
        raise HTTPException(status_code=400, detail="Speaker is required.")

    if speaker not in SPEAKERS:
        raise HTTPException(status_code=400, detail=f"Speaker must be one of {SPEAKERS}")

    if model_size not in MODEL_SIZES:
        raise HTTPException(status_code=400, detail=f"Model size must be one of {MODEL_SIZES}")

    try:
        tts = CUSTOM_VOICE_MODELS[model_size]
        wavs, sr = tts.generate_custom_voice(
            text=text.strip(),
            language=language,
            speaker=speaker.lower().replace(" ", "_"),
            instruct=instruct.strip() if instruct else None,
            non_streaming_mode=True,
            max_new_tokens=2048,
        )

        wav_bytes = _audio_to_wav_bytes(wavs[0], sr)

        return StreamingResponse(
            iter([wav_bytes]),
            media_type="audio/wav",
            headers={"Content-Disposition": "attachment; filename=custom_voice.wav"}
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
    if not text or not text.strip():
        raise HTTPException(status_code=400, detail="Text is required.")
    if not speaker:
        raise HTTPException(status_code=400, detail="Speaker is required.")

    if speaker not in SPEAKERS:
        raise HTTPException(status_code=400, detail=f"Speaker must be one of {SPEAKERS}")

    if model_size not in MODEL_SIZES:
        raise HTTPException(status_code=400, detail=f"Model size must be one of {MODEL_SIZES}")

    try:
        tts = CUSTOM_VOICE_MODELS[model_size]
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


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8880)

