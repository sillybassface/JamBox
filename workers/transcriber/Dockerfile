FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir \
    torch --index-url https://download.pytorch.org/whl/cpu \
    torchaudio --index-url https://download.pytorch.org/whl/cpu

COPY workers/transcriber/requirements.txt .

RUN pip install --no-cache-dir -r requirements.txt

COPY workers/transcriber/app/ app/
COPY workers/transcriber/main.py .

ENV DATA_DIR=/data
ENV REDIS_URL=redis://redis:6379
ENV XDG_CACHE_HOME=/model_cache
ENV PYTHONPATH=/app:/app/workers/transcriber

CMD ["python", "main.py"]