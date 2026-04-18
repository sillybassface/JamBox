from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.database import init_db, close_db
from app.tasks.worker import start_worker, stop_worker
from app.auth.router import router as auth_router
from app.songs.router import router as songs_router
from app.tasks.router import router as tasks_router
from app.audio.router import router as audio_router
from app.favourites.router import router as favourites_router
from app.config import settings


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    await start_worker()
    yield
    await stop_worker()
    await close_db()


app = FastAPI(
    title="Jambox API",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        settings.frontend_url,
        "http://localhost:8080",
        "http://localhost:4173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(songs_router)
app.include_router(tasks_router)
app.include_router(audio_router)
app.include_router(favourites_router)


@app.get("/api/health")
async def health():
    return {"status": "ok", "app": settings.app_name}
