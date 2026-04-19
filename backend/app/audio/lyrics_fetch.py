import asyncio
import httpx
import json
import logging
import subprocess
import urllib.parse

logger = logging.getLogger(__name__)


def get_youtube_id(youtube_url: str) -> str | None:
    """Extract YouTube video ID from URL."""
    try:
        parsed = urllib.parse.urlparse(youtube_url)
        query = urllib.parse.parse_qs(parsed.query)
        return query.get("v", [None])[0]
    except Exception:
        return None


async def fetch_external_lyrics(
    title: str, artist: str | None, youtube_url: str | None = None
) -> str | None:
    """Fetch lyrics from external sources.

    Tries multiple sources in order of priority:
    1. YouTube captions (auto-generated)
    2. Lyrics.ovh (global)
    3. lrclib (global)
    4. Fallback to None if not found

    Args:
        title: Song title
        artist: Artist name (optional but preferred)
        youtube_url: YouTube URL for caption extraction

    Returns:
        Plain text lyrics or None if not found
    """
    if not title:
        return None

    if youtube_url:
        lyrics = await _fetch_from_youtube_captions(youtube_url)
        if lyrics:
            logger.info(f"Found lyrics from YouTube captions for {title}")
            return lyrics

    artists_to_try = []
    if artist:
        artists_to_try.append(artist)
    artists_to_try.append("unknown")

    for artist_name in artists_to_try:
        lyrics = await _fetch_from_lyrics_ovh(artist_name, title)
        if lyrics:
            return lyrics
        lyrics = await _fetch_from_lrclib(artist_name, title)
        if lyrics:
            return lyrics

    return None


async def _fetch_from_youtube_captions(youtube_url: str) -> str | None:
    """Fetch auto-generated captions from YouTube via yt-dlp."""
    try:
        yt_id = get_youtube_id(youtube_url)
        if not yt_id:
            return None

        cmd = [
            "yt-dlp",
            "--skip-download",
            "--write-auto-sub",
            "--sub-lang",
            "vi,en",
            "--output",
            "%(id)s.%(ext)s",
            f"https://www.youtube.com/watch?v={yt_id}",
        ]

        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await proc.communicate()

        if proc.returncode != 0:
            logger.debug(f"yt-dlp failed: {stderr.decode()}")
            return None

        import glob as glob_module

        vtt_files = glob_module.glob(f"*.{yt_id}.*.vtt")
        if not vtt_files:
            vtt_files = glob_module.glob("*.vtt")

        if not vtt_files:
            return None

        captions = _parse_vtt_file(vtt_files[0])

        for f in vtt_files:
            try:
                import pathlib

                pathlib.Path(f).unlink()
            except Exception:
                pass

        if captions and len(captions.split()) > 5:
            return captions

    except Exception as e:
        logger.debug(f"YouTube captions failed: {e}")
    return None


def _parse_vtt_file(filepath: str) -> str | None:
    """Parse VTT subtitle file to extract text."""
    try:
        with open(filepath, encoding="utf-8") as f:
            content = f.read()

        lines = content.split("\n")
        text_lines = []
        in_cue = False

        for line in lines:
            line = line.strip()
            if not line:
                if in_cue and text_lines:
                    text_lines.append("")
                in_cue = False
                continue
            if line.startswith(("WEBVTT", "NOTE", "STYLE", "REGION")):
                continue
            if "-->" in line:
                in_cue = True
                continue
            if in_cue:
                import re

                line = re.sub(r"<[^>]+>", "", line)
                line = line.strip()
                if line:
                    text_lines.append(line)

        result = "\n".join(text_lines)
        return _clean_lyrics(result) if result else None

    except Exception as e:
        logger.debug(f"VTT parsing failed: {e}")
        return None


def _clean_lyrics(text: str) -> str:
    """Clean up lyrics text."""
    lines = text.split("\n")
    cleaned = []
    for line in lines:
        line = line.strip()
        if line and not line.startswith(("(", "[", "{", "<")):
            cleaned.append(line)
    return "\n".join(cleaned)


async def _fetch_from_lyrics_ovh(artist: str, title: str) -> str | None:
    """Fetch from Lyrics.ovh API."""
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(f"https://api.lyrics.ovh/v1/{artist}/{title}")
            if response.status_code == 200:
                data = response.json()
                lyrics = data.get("lyrics")
                if lyrics:
                    logger.info(f"Found lyrics on Lyrics.ovh for {artist} - {title}")
                    return _clean_lyrics(lyrics)
    except Exception as e:
        logger.warning(f"Failed to fetch from Lyrics.ovh: {e}")
    return None


async def _fetch_from_lyrics_vn(artist: str, title: str) -> str | None:
    """Scrape from lyrics.vn (Vietnamese lyrics site)."""
    try:
        query = f"{artist} {title}".strip()
        encoded = urllib.parse.quote(query)
        url = f"https://www.lyrics.vn/ajax.php"

        async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as client:
            response = await client.post(
                url,
                data={"action": "search", "keyword": query},
                headers={"X-Requested-With": "XMLHttpRequest"},
            )
            if response.status_code != 200:
                return None

            data = response.json()
            results = data.get("data", []) or []
            if not results:
                return None

            first = results[0]
            song_id = first.get("id")
            if not song_id:
                return None

            detail_url = f"https://www.lyrics.vn/ajax.php"
            detail_resp = await client.post(
                detail_url,
                data={"action": "get_song", "id": song_id},
                headers={"X-Requested-With": "XMLHttpRequest"},
            )
            if detail_resp.status_code != 200:
                return None

            detail = detail_resp.json()
            lyrics = detail.get("lyrics") or detail.get("text") or detail.get("content")
            if lyrics:
                logger.info(f"Found lyrics on lyrics.vn for {artist} - {title}")
                return _clean_lyrics(lyrics)

    except Exception as e:
        logger.debug(f"Failed to fetch from lyrics.vn: {e}")
    return None


async def _fetch_from_lrclib(artist: str, title: str) -> str | None:
    """Fetch from lrclib.net (global lyrics database)."""
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            url = (
                f"https://lrclib.net/api/get"
                f"?artist_name={urllib.parse.quote(artist)}"
                f"&track_name={urllib.parse.quote(title)}"
            )
            response = await client.get(url)
            if response.status_code == 200:
                data = response.json()
                lyrics = data.get("lyrics")
                if lyrics:
                    logger.info(f"Found lyrics on lrclib for {artist} - {title}")
                    return _clean_lyrics(lyrics)
    except Exception as e:
        logger.debug(f"Failed to fetch from lrclib: {e}")
    return None
