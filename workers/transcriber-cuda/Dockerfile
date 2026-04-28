FROM nvidia/cuda:12.1.1-cudnn8-runtime-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-pip python3-dev \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

RUN pip install --no-cache-dir \
    torch --index-url https://download.pytorch.org/whl/cu121

COPY workers/transcriber-cuda/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy shared transcriber app code, then overlay cuda-specific files on top.
COPY workers/transcriber/app/ app/
COPY workers/transcriber-cuda/app/ app/
COPY workers/transcriber-cuda/main.py .

ENV DATA_DIR=/data
ENV REDIS_URL=redis://redis:6379
ENV XDG_CACHE_HOME=/model_cache
ENV PYTHONPATH=/app

CMD ["python3", "main.py"]
