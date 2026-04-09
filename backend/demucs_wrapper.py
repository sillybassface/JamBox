#!/usr/bin/python3
"""
Wrapper around demucs that monkey-patches torchaudio.save to use soundfile
instead of torchcodec (which is unavailable in this environment).

Usage: python3 demucs_wrapper.py [demucs args...]
"""
import sys
import numpy as np

# Monkey-patch torchaudio.save before demucs imports it
import soundfile as sf
import torchaudio

def _save_with_soundfile(uri, src, sample_rate, **kwargs):
    """Replace torchaudio.save with soundfile-based implementation."""
    import torch
    uri = str(uri)
    if isinstance(src, torch.Tensor):
        data = src.cpu().numpy()
    else:
        data = np.array(src)
    # soundfile expects (frames, channels) for multi-channel
    if data.ndim == 2:
        data = data.T  # (channels, frames) -> (frames, channels)
    sf.write(uri, data, sample_rate)

torchaudio.save = _save_with_soundfile

# Also patch the internal backend
try:
    import torchaudio.backend.soundfile_backend as _sfb
    _sfb.save = _save_with_soundfile
except Exception:
    pass

# Now run demucs as if we were the demucs script
from demucs.separate import main
sys.exit(main())
