.PHONY: backend frontend install dev

install:
	cd backend && /usr/bin/python3 -m pip install --user --break-system-packages -e ".[dev]"
	cd frontend && npm install

backend:
	cd backend && /usr/bin/python3 -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

frontend:
	cd frontend && npm run dev

dev:
	make -j2 backend frontend
