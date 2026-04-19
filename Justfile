default:
    @just --list

install:
    # Prerequisites:
    #   Linux (Debian/Ubuntu): sudo apt install python3.12-dev
    #   macOS: brew install python3 ffmpeg
    # CC=gcc-13: madmom's C extensions look for gcc-12 by name on Ubuntu 24+; this redirects to gcc-13.
    # Uses OS detection via shell
    @bash -c 'if [ "$(uname)" = "Linux" ]; then cd backend && CC=gcc-13 uv pip install -e ".[dev,ml]"; else cd backend && uv pip install -e ".[dev,ml]"; fi'
    cd frontend && npm install

[parallel]
run: backend frontend

backend:
    @bash -c 'if [ "$(uname)" = "Linux" ]; then /usr/bin/python3 -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000; else python3 -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000; fi'

frontend:
    cd frontend && npm run dev