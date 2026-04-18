default:
    @just --list

install:
    # Prerequisites (Debian/Ubuntu): sudo apt install python3.12-dev
    # CC=gcc-13: madmom's C extensions look for gcc-12 by name on Ubuntu 24+; this redirects to gcc-13.
    cd backend && CC=gcc-13 /usr/bin/python3 -m pip install --user --break-system-packages -e ".[dev,ml]"
    cd frontend && npm install

[parallel]
run: backend frontend

backend:
    cd backend && /usr/bin/python3 -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

frontend:
    cd frontend && npm run dev

