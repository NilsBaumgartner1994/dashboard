# ── base stage (shared) ───────────────────────────────────────────────────────
FROM python:3.11-slim AS base

WORKDIR /app

# System deps for soundfile / scipy
RUN apt-get update && apt-get install -y --no-install-recommends \
    libsndfile1 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .

# ── CPU-only build target ─────────────────────────────────────────────────────
FROM base AS cpu-base

# Install PyTorch CPU-only wheel first so the torch index is used
RUN pip install --no-cache-dir \
    torch==2.6.0+cpu \
    torchaudio==2.6.0+cpu \
    --index-url https://download.pytorch.org/whl/cpu

# Install remaining requirements (excluding torch/torchaudio already installed)
RUN pip install --no-cache-dir \
    fastapi==0.115.5 \
    "uvicorn[standard]==0.32.1" \
    transformers==5.2.0 \
    huggingface_hub==1.4.1 \
    soundfile==0.12.1 \
    "numpy==2.0.2" \
    scipy==1.14.1

COPY app.py .

ENV TTS_MODEL_ID=Qwen/Qwen3-TTS-12Hz-0.6B-Base
ENV PYTHONUNBUFFERED=1

EXPOSE 8880

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8880"]
