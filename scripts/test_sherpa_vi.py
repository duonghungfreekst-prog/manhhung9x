"""Test sherpa-onnx with Piper vi_VN-vais1000-medium.onnx model."""
import sys, os, io, json, wave
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

# Paths
BASE   = os.path.join(os.path.dirname(__file__), '..', 'bin', 'piper')
MODEL  = os.path.join(BASE, 'vi_VN-vais1000-medium.onnx')
CONFIG = os.path.join(BASE, 'vi_VN-vais1000-medium.onnx.json')
ESPEAK = BASE  # espeak-ng-data is in the same folder as piper

print('Model :', os.path.exists(MODEL), MODEL)
print('Config:', os.path.exists(CONFIG), CONFIG)
print('espeak:', os.path.exists(os.path.join(ESPEAK, 'espeak-ng-data')), ESPEAK)

# Read config to get sample rate
with open(CONFIG, 'r', encoding='utf-8') as f:
    cfg = json.load(f)
print('Sample rate:', cfg.get('audio', {}).get('sample_rate'))
print('Language:', cfg.get('espeak', {}).get('voice'))
print('Phoneme type:', cfg.get('phoneme_type'))

import sherpa_onnx

# Build TTS config for Piper/VITS model
tts_config = sherpa_onnx.OfflineTtsConfig(
    model=sherpa_onnx.OfflineTtsModelConfig(
        vits=sherpa_onnx.OfflineTtsVitsModelConfig(
            model=MODEL,
            lexicon='',
            tokens='',
            data_dir=os.path.join(ESPEAK, 'espeak-ng-data'),
        ),
        num_threads=2,
        debug=False,
        provider='cpu',
    ),
    rule_fsts='',
    max_num_sentences=1,
)

print('\nCreating TTS engine...')
tts = sherpa_onnx.OfflineTts(tts_config)
print('sample_rate:', tts.sample_rate)

print('Generating audio...')
audio = tts.generate('Xin chao ban, day la thu nghiem giong noi tieng Viet.', sid=0, speed=1.0)
print(f'Samples: {len(audio.samples)}, Rate: {audio.sample_rate}')

# Save to WAV
out_wav = os.path.join(BASE, 'test_output.wav')
import array
with wave.open(out_wav, 'w') as wf:
    wf.setnchannels(1)
    wf.setsampwidth(2)
    wf.setframerate(audio.sample_rate)
    samples_int16 = array.array('h', [max(-32768, min(32767, int(s * 32767))) for s in audio.samples])
    wf.writeframes(samples_int16.tobytes())
print(f'Saved WAV: {out_wav}')
print('TEST PASS!')
