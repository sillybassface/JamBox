FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    git \
    gcc \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir \
    torch --index-url https://download.pytorch.org/whl/cpu \
    torchaudio --index-url https://download.pytorch.org/whl/cpu

COPY workers/analyzer/requirements.txt .

RUN pip install --no-cache-dir setuptools Cython && \
    pip install --no-cache-dir -r requirements.txt && \
    pip install --no-cache-dir --no-build-isolation \
    "madmom @ git+https://github.com/CPJKU/madmom@main"

COPY workers/analyzer/app/ app/
COPY workers/analyzer/main.py .
COPY workers/analyzer/pipeline.py .
COPY workers/analyzer/demucs_wrapper.py .

ENV DATA_DIR=/data
ENV REDIS_URL=redis://redis:6379
ENV TORCH_HOME=/model_cache

CMD ["python", "main.py"]