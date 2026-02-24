"""
Qwen3-TTS FastAPI server (CPU-only).

Endpoints:
  GET  /health           → {"status": "ok", "model": "..."}
  POST /tts/generate     → audio/wav binary
    body: { "text": "...", "voice": "..." }   (voice is optional)
"""

from __future__ import annotations

import io
import logging
import os
import time
from contextlib import asynccontextmanager
from typing import Optional

import numpy as np
import soundfile as sf
import torch
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, JSONResponse
from pydantic import BaseModel
from transformers import AutoProcessor, AutoModelForCausalLM

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("tts-api")

MODEL_ID = os.environ.get("TTS_MODEL_ID", "Qwen/Qwen3-TTS-12Hz-0.6B-Base")
DEVICE = "cpu"

_processor = None
_model = None


def _load_model() -> None:
    global _processor, _model
    logger.info("Loading TTS model %s on %s …", MODEL_ID, DEVICE)
    start = time.time()
    # trust_remote_code=True is required because the Qwen3-TTS model ships with a
    # custom 'qwen3_tts' architecture not yet registered in the transformers library.
    # Ensure you only use this with trusted, pinned model checkpoints.
    _processor = AutoProcessor.from_pretrained(MODEL_ID, trust_remote_code=True)
    _model = AutoModelForCausalLM.from_pretrained(MODEL_ID, torch_dtype=torch.float32, trust_remote_code=True)
    _model.to(DEVICE)
    _model.eval()
    logger.info("Model loaded in %.1f s", time.time() - start)


@asynccontextmanager
async def lifespan(app: FastAPI):
    _load_model()
    yield


app = FastAPI(title="Qwen3-TTS API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class TtsRequest(BaseModel):
    text: str
    voice: Optional[str] = None


@app.get("/health")
async def health():
    loaded = _model is not None and _processor is not None
    return JSONResponse(
        status_code=200 if loaded else 503,
        content={"status": "ok" if loaded else "loading", "model": MODEL_ID},
    )


@app.post("/tts/generate")
async def generate_tts(req: TtsRequest):
    if _model is None or _processor is None:
        raise HTTPException(status_code=503, detail="Model not loaded yet")

    if not req.text or not req.text.strip():
        raise HTTPException(status_code=400, detail="text must not be empty")

    logger.info("Generating TTS for %d chars …", len(req.text))
    start = time.time()

    try:
        inputs = _processor(text=req.text, return_tensors="pt").to(DEVICE)
        with torch.no_grad():
            output = _model.generate(
                **inputs,
                do_sample=True,
                temperature=0.7,
                max_new_tokens=2048,
            )

        # The model returns token ids; decode to waveform via the processor
        audio = _processor.batch_decode(output, skip_special_tokens=True)
        # Depending on model variant, audio may already be a numpy array or need decoding
        if isinstance(audio, (list, tuple)):
            audio = audio[0]
        if isinstance(audio, torch.Tensor):
            audio = audio.cpu().numpy()
        if not isinstance(audio, np.ndarray):
            audio = np.array(audio, dtype=np.float32)
        audio = audio.flatten().astype(np.float32)

        sample_rate = getattr(_processor, "sampling_rate", 24000)
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
        headers={"X-Generation-Time-Ms": str(int(elapsed * 1000))},
    )
