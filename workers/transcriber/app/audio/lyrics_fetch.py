"""Fetch lyrics from external sources (YouTube captions, LRCLIB, lyrics.ovh)."""
import logging
import re
import httpx

logger = logging.getLogger(__name__)

LRCLIB_URL = "https://lrclib.net/api/get"
LYRICS_OVH_URL = "https://api.lyrics.ovh/v1"


def _normalize_title(title: str) -> str:
    """Remove common noise patterns from titles."""
    title = re.sub(r'\s*\(.*?\)\s*', ' ', title)
    title = re.sub(r'\s*\[.*?\]\s*', ' ', title)
    title = re.sub(r'\s*[-–|]\s*(cover|remix|official|audio|lyrics|mv)\s*', ' ', title, flags=re.IGNORECASE)
    title = re.sub(r'\s*\|\s*.*$', '', title)
    return title.strip()


async def fetch_youtube_captions(youtube_url: str) -> str | None:
    """Extract captions/subtitles from YouTube using yt-dlp."""
    import subprocess
    try:
        result = subprocess.run(
            ["yt-dlp", "--skip-download", "--write-auto-sub", "--sub-lang", "vi,en",
             "--output", "-", youtube_url],
            capture_output=True, text=True, timeout=30
        )
        if result.returncode == 0 and result.stdout:
            lines = result.stdout.strip().split('\n')
            captions = [l for l in lines if l.strip() and not l.startswith('[')]
            return ' '.join(captions[:500]) if captions else None
    except Exception:
        pass
    return None


async def fetch_lrclib(title: str, artist: str | None) -> str | None:
    """Fetch from LRCLIB (community lyrics database)."""
    artist_clean = artist or "unknown"
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(LRCLIB_URL, params={"artist_name": artist_clean, "track_name": title})
            if resp.status_code == 200:
                data = resp.json()
                return data.get("lyrics", "").replace('\r\n', '\n')
    except Exception as e:
        logger.debug(f"LRCLIB lookup failed: {e}")
    return None


async def fetch_lyrics_ovh(title: str, artist: str | None) -> str | None:
    """Fetch from lyrics.ovh API."""
    artist_clean = re.sub(r'\s*\(.*?\)\s*', '', artist or '').strip()
    title_clean = _normalize_title(title)
    if not title_clean:
        return None
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(f"{LYRICS_OVH_URL}/{artist_clean}/{title_clean}")
            if resp.status_code == 200:
                return resp.json().get("lyrics", "")
    except Exception as e:
        logger.debug(f"lyrics.ovh lookup failed: {e}")
    return None


async def fetch_external_lyrics(
    title: str,
    artist: str | None = None,
    youtube_url: str | None = None,
) -> str | None:
    """Try multiple sources in order of preference.

    Priority: YouTube captions > LRCLIB > lyrics.ovh
    """
    clean_title = _normalize_title(title)

    sources = [
        ("YouTube", lambda: fetch_youtube_captions(youtube_url) if youtube_url else None),
        ("LRCLIB", lambda: fetch_lrclib(clean_title, artist)),
        ("lyrics.ovh", lambda: fetch_lyrics_ovh(clean_title, artist)),
    ]

    for name, fetch_fn in sources:
        try:
            result = await fetch_fn()
            if result and len(result) > 50:
                logger.info(f"Found lyrics from {name}: {len(result)} chars")
                return result
        except Exception as e:
            logger.debug(f"{name} failed: {e}")

    logger.info(f"No external lyrics found for: {clean_title}")
    return None