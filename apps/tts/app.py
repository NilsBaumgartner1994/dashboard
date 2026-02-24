"""
Qwen3-TTS FastAPI server (CPU-only).

Endpoints:
  GET  /health           → {"status": "ok", "default_model": "...", "loaded_models": [...]}
  POST /tts/generate     → audio/wav binary
"""

from __future__ import annotations

import io
import logging
import os
import time
from contextlib import asynccontextmanager
from typing import Any, Optional

import numpy as np
import soundfile as sf
import torch
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel, Field
from transformers import AutoModel, AutoProcessor

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("tts-api")

DEFAULT_MODELS = [
    "Qwen/Qwen3-TTS-12Hz-0.6B-Base",
    "Qwen/Qwen3-TTS-1.7B-Base",
]
DEVICE = "cpu"
HF_TOKEN = os.environ.get("HUGGING_FACE_HUB_TOKEN") or None


def _parse_models() -> list[str]:
    model_ids = os.environ.get("TTS_MODEL_IDS", "").strip()
    if model_ids:
        parsed = [m.strip() for m in model_ids.split(",") if m.strip()]
    else:
        single = os.environ.get("TTS_MODEL_ID", "").strip()
        parsed = [single] if single else DEFAULT_MODELS.copy()

    for default_model in DEFAULT_MODELS:
        if default_model not in parsed:
            parsed.append(default_model)
    return parsed


SUPPORTED_MODEL_IDS = _parse_models()
DEFAULT_MODEL_ID = os.environ.get("TTS_DEFAULT_MODEL_ID", SUPPORTED_MODEL_IDS[0])
if DEFAULT_MODEL_ID not in SUPPORTED_MODEL_IDS:
    SUPPORTED_MODEL_IDS.insert(0, DEFAULT_MODEL_ID)

_processors: dict[str, Any] = {}
_models: dict[str, Any] = {}


class TtsRequest(BaseModel):
    text: str
    voice: Optional[str] = None
    model_id: Optional[str] = None
    mode: str = Field(default="voice_design")
    # For forward compatibility (voice cloning):
    reference_audio_base64: Optional[str] = None
    reference_text: Optional[str] = None


def _load_model(model_id: str) -> None:
    logger.info("Loading TTS model %s on %s …", model_id, DEVICE)
    start = time.time()
    processor = AutoProcessor.from_pretrained(model_id, trust_remote_code=True, token=HF_TOKEN)
    model = AutoModel.from_pretrained(
        model_id,
        trust_remote_code=True,
        torch_dtype=torch.float32,
        token=HF_TOKEN,
    )
    model.to(DEVICE)
    model.eval()
    _processors[model_id] = processor
    _models[model_id] = model
    logger.info("Model %s loaded in %.1f s", model_id, time.time() - start)


def _load_models() -> None:
    for model_id in SUPPORTED_MODEL_IDS:
        _load_model(model_id)


def _resolve_model(model_id: Optional[str]) -> tuple[str, Any, Any]:
    selected_model = model_id or DEFAULT_MODEL_ID
    if selected_model not in _models or selected_model not in _processors:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported model_id '{selected_model}'. Supported: {SUPPORTED_MODEL_IDS}",
        )
    return selected_model, _processors[selected_model], _models[selected_model]


def _to_audio_array(output: Any, processor: Any) -> np.ndarray:
    audio = output
    if isinstance(audio, torch.Tensor):
        audio = audio.detach().cpu().numpy()
    elif isinstance(audio, (list, tuple)):
        audio = audio[0]
        if isinstance(audio, torch.Tensor):
            audio = audio.detach().cpu().numpy()

    if not isinstance(audio, np.ndarray):
        decoded = processor.batch_decode(output, skip_special_tokens=True)
        audio = decoded[0] if isinstance(decoded, (list, tuple)) else decoded

    if isinstance(audio, torch.Tensor):
        audio = audio.detach().cpu().numpy()

    if not isinstance(audio, np.ndarray):
        audio = np.array(audio, dtype=np.float32)

    return audio.flatten().astype(np.float32)


@asynccontextmanager
async def lifespan(app: FastAPI):
    _load_models()
    yield


app = FastAPI(title="Qwen3-TTS API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    loaded = len(_models) > 0 and len(_models) == len(_processors)
    return JSONResponse(
        status_code=200 if loaded else 503,
        content={
            "status": "ok" if loaded else "loading",
            "default_model": DEFAULT_MODEL_ID,
            "loaded_models": list(_models.keys()),
            "supported_models": SUPPORTED_MODEL_IDS,
        },
    )


@app.post("/tts/generate")
async def generate_tts(req: TtsRequest):
    if req.mode != "voice_design":
        raise HTTPException(status_code=400, detail="Only mode='voice_design' is currently supported")
    if not req.text or not req.text.strip():
        raise HTTPException(status_code=400, detail="text must not be empty")

    model_id, processor, model = _resolve_model(req.model_id)

    logger.info("Generating TTS for %d chars with %s …", len(req.text), model_id)
    start = time.time()

    try:
        processor_kwargs: dict[str, Any] = {"text": req.text, "return_tensors": "pt"}
        if req.voice:
            processor_kwargs["voice"] = req.voice

        inputs = processor(**processor_kwargs)
        if hasattr(inputs, "to"):
            inputs = inputs.to(DEVICE)

        with torch.no_grad():
            if hasattr(model, "generate_speech"):
                output = model.generate_speech(**inputs)
            elif hasattr(model, "generate_audio"):
                output = model.generate_audio(**inputs)
            else:
                output = model.generate(
                    **inputs,
                    do_sample=True,
                    temperature=0.7,
                    max_new_tokens=2048,
                )

        audio = _to_audio_array(output, processor)
        sample_rate = getattr(processor, "sampling_rate", 24000)
        elapsed = time.time() - start
        logger.info("Generated %.2f s of audio in %.2f s", len(audio) / sample_rate, elapsed)
    except Exception as exc:
        logger.exception("TTS generation failed")
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    buf = io.BytesIO()
    sf.write(buf, audio, samplerate=sample_rate, format="WAV")
    buf.seek(0)

    return Response(
        content=buf.read(),
        media_type="audio/wav",
        headers={
            "X-Generation-Time-Ms": str(int(elapsed * 1000)),
            "X-TTS-Model": model_id,
        },
    )
