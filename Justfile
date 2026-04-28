default:
    @just --list

build:
    docker compose build

up:
    docker compose up

bud:
    docker compose up --build -d

install-kelvinbksoh-medium:
    docker exec -it jambox-song-transcriber-1 huggingface-cli download kelvinbksoh/whisper-medium-vietnamese-lyrics-transcription
