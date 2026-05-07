default:
    @just --list

build:
    docker compose build

up:
    docker compose up

bud:
    docker compose up --build -d

install-kelvinbksoh-medium:
    docker exec -it jambox-song-transcriber-cuda-1 hf download kelvinbksoh/whisper-medium-vietnamese-lyrics-transcription
    
install-kelvinbksoh-large:
    docker exec -it jambox-song-transcriber-cuda-1 hf download kelvinbksoh/whisper-large-v2-vietnamese-lyrics-transcription
