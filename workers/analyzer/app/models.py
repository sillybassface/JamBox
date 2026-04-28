from pydantic import BaseModel, HttpUrl
from typing import Optional
from datetime import datetime


class UserOut(BaseModel):
    id: str
    email: str
    display_name: str
    avatar_url: Optional[str] = None
    is_admin: bool = False


class SongBase(BaseModel):
    youtube_url: str
    title: str
    artist: Optional[str] = None
    duration_secs: Optional[float] = None
    thumbnail_url: Optional[str] = None


class SongCreate(BaseModel):
    youtube_url: str


class SongOut(BaseModel):
    id: str
    youtube_url: str
    youtube_id: str
    title: str
    artist: Optional[str] = None
    duration_secs: Optional[float] = None
    thumbnail_url: Optional[str] = None
    status: str
    error_message: Optional[str] = None
    added_by: Optional[str] = None
    created_at: str
    updated_at: str
    is_favourite: bool = False
    stems: list[str] = []


class TaskOut(BaseModel):
    id: str
    song_id: str
    status: str
    step: Optional[str] = None
    progress: float = 0
    error: Optional[str] = None
    created_at: str


class AddSongResponse(BaseModel):
    song: SongOut
    task_id: str


class WaveformData(BaseModel):
    peaks: list[float]
    duration: float
    sample_rate: int = 22050
    samples_per_pixel: int = 512
