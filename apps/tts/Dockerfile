# ── base stage (shared) ───────────────────────────────────────────────────────
FROM python:3.11-slim AS base

WORKDIR /app

# System deps for soundfile / scipy, git for pip, and sox for audio processing
RUN apt-get update && apt-get install -y --no-install-recommends \
    libsndfile1 \
    git \
    sox \
    libsox-dev \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .

# ── CPU-only build target ─────────────────────────────────────────────────────
FROM base AS cpu-base

# Install PyTorch CPU-only wheel first so the torch index is used
RUN pip install --no-cache-dir \
    torch==2.8.0+cpu \
    torchaudio==2.8.0+cpu \
    --index-url https://download.pytorch.org/whl/cpu

# Install all requirements from requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Create data directory for HuggingFace models (will be mounted via volume)
RUN mkdir -p /app/data/tts-models

COPY qwen_tts/ ./qwen_tts/
COPY start.py .

ENV TTS_MODEL_ID=Qwen/Qwen3-TTS-12Hz-0.6B-Base
ENV PYTHONUNBUFFERED=1

EXPOSE 8880

CMD ["uvicorn", "start:app", "--host", "0.0.0.0", "--port", "8880"]
