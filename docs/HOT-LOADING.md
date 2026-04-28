# Hot Loading

Changes to source code are reflected in running containers automatically — no rebuild required.

## How to use

```bash
docker compose up --build
```

The override file (`docker-compose.override.yml`) is merged automatically. No extra flags needed.

To run in production mode (without hot loading):

```bash
docker compose -f docker-compose.yml up --build
```

## How it works per service

### Backend (`backend/app/`)

`docker-compose.override.yml` bind-mounts `./backend/app` into the container at `/app/app`, then overrides the start command to use uvicorn's `--reload` flag:

```yaml
backend:
  volumes:
    - ./backend/app:/app/app
  command: uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

uvicorn watches all `.py` files under `/app/app` using the `watchfiles` library. When any file changes, it restarts the server process in-place — the container keeps running.

### Frontend (`frontend/src/`)

The override swaps the production nginx image for a dev image (`frontend/Dockerfile.dev`) that runs the Vite dev server directly:

```yaml
frontend:
  build:
    context: frontend
    dockerfile: Dockerfile.dev
  volumes:
    - ./frontend:/app
    - /app/node_modules   # anonymous volume — preserves node_modules from image build
  environment:
    BACKEND_URL: http://backend:8000
```

Vite provides HMR (Hot Module Replacement): React components update in the browser without a full page reload, and state is preserved where possible. The anonymous volume for `node_modules` ensures the host directory mount doesn't shadow the packages installed during image build.

The Vite proxy target is read from `BACKEND_URL` at server startup (`vite.config.ts`), resolving to `http://backend:8000` inside Docker and falling back to `http://localhost:8000` for local development outside Docker.

### Workers (`workers/analysis/`, `workers/transcription/`)

Source files are bind-mounted into the running containers and `watchmedo` (from the `watchdog` package) restarts the worker process when any `.py` file changes:

```yaml
worker-transcription:
  volumes:
    - ./workers/transcription/app:/app/app
    - ./workers/transcription/main.py:/app/main.py
  command: >
    sh -c "pip install watchdog -q &&
           watchmedo auto-restart --recursive --patterns='*.py' --directory=/app -- python main.py"
```

`watchmedo auto-restart` watches `/app` recursively and re-executes `python main.py` on any `.py` change. Because workers run long-lived jobs (Whisper, Demucs), a restart will interrupt any in-progress task — the task will be marked failed on the next startup via `fail_stale_tasks`.

## Files involved

| File | Purpose |
|---|---|
| `docker-compose.override.yml` | Adds bind mounts and dev commands; merged automatically by Docker Compose |
| `frontend/Dockerfile.dev` | Runs `npm run dev` instead of building a static bundle |
| `frontend/vite.config.ts` | Reads `BACKEND_URL` env var for the API proxy target |
