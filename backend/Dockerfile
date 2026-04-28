FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir yt-dlp

COPY backend/pyproject.toml ./
RUN pip install --no-cache-dir -e "."

COPY backend/app/ app/

ENV DATA_DIR=/data
ENV REDIS_URL=redis://redis:6379

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]