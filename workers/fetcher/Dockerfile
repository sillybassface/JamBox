FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

COPY workers/fetcher/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY workers/fetcher/app/ app/
COPY workers/fetcher/main.py .
COPY workers/fetcher/pipeline.py .

ENV DATA_DIR=/data
ENV REDIS_URL=redis://redis:6379

CMD ["python", "main.py"]
