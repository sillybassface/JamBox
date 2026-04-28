"""Standalone HuggingFace Whisper inference — invoked as a subprocess so the OS can kill it."""
import json
import sys


def main():
    if len(sys.argv) < 4:
        print(json.dumps({"error": "Usage: hf_transcribe_worker.py <model_id> <audio_path> <language>"}))
        sys.exit(1)

    model_id, audio_path, language = sys.argv[1], sys.argv[2], sys.argv[3]

    from huggingface_hub import try_to_load_from_cache
    cache_check = try_to_load_from_cache(model_id, "config.json")
    if not isinstance(cache_check, str) or not cache_check:
        print(json.dumps({"error": f"Model '{model_id}' is not cached locally. "
                                    f"Run: huggingface-cli download {model_id} inside the transcriber container."}))
        sys.exit(1)

    import torch
    from transformers import AutoModelForSpeechSeq2Seq, AutoProcessor, pipeline as hf_pipeline

    device = "cuda" if torch.cuda.is_available() else "cpu"
    dtype = torch.float16 if device == "cuda" else torch.float32

    model = AutoModelForSpeechSeq2Seq.from_pretrained(model_id, torch_dtype=dtype, local_files_only=True)
    processor = AutoProcessor.from_pretrained(model_id, local_files_only=True)

    pipe = hf_pipeline(
        "automatic-speech-recognition",
        model=model,
        tokenizer=processor.tokenizer,
        feature_extractor=processor.feature_extractor,
        torch_dtype=dtype,
        device=device,
    )

    result = pipe(
        audio_path,
        chunk_length_s=30,
        stride_length_s=5,
        return_timestamps="word",
        generate_kwargs={"language": language},
    )

    words = []
    for chunk in result.get("chunks", []):
        word = chunk.get("text", "").strip()
        ts = chunk.get("timestamp", (0.0, 0.0))
        if word and isinstance(ts, (tuple, list)):
            words.append({"word": word, "start": round(ts[0], 3), "end": round(ts[1], 3)})

    print(json.dumps(words))


if __name__ == "__main__":
    main()
