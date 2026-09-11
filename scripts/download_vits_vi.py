"""Download vits-mms-vie model for sherpa-onnx Vietnamese offline TTS."""
import sys, os, io, urllib.request, tarfile, shutil

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

MODEL_URL = "https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/vits-mms-vie.tar.bz2"
OUT_DIR   = os.path.join(os.path.dirname(__file__), '..', 'bin', 'vits-vi')
TAR_PATH  = os.path.join(os.path.dirname(__file__), '..', 'bin', 'vits-mms-vie.tar.bz2')

os.makedirs(os.path.join(os.path.dirname(__file__), '..', 'bin'), exist_ok=True)

def dl(url, dest):
    print(f'Downloading: {url}')
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req, timeout=120) as r, open(dest, 'wb') as f:
        total = int(r.headers.get('Content-Length', 0))
        done  = 0
        while True:
            buf = r.read(65536)
            if not buf: break
            f.write(buf)
            done += len(buf)
            if total:
                pct = done * 100 // total
                print(f'\r  {pct}% ({done//1024}KB / {total//1024}KB)   ', end='')
        print()
    print(f'  Saved: {dest} ({os.path.getsize(dest)//1024}KB)')

# Download
if not os.path.exists(TAR_PATH) or os.path.getsize(TAR_PATH) < 1024:
    dl(MODEL_URL, TAR_PATH)
else:
    print(f'Already downloaded: {TAR_PATH}')

# Extract
print('Extracting...')
if os.path.exists(OUT_DIR):
    shutil.rmtree(OUT_DIR)
os.makedirs(OUT_DIR, exist_ok=True)

with tarfile.open(TAR_PATH, 'r:bz2') as tar:
    for member in tar.getmembers():
        # Strip leading folder name (vits-mms-vie/) -> bin/vits-vi/
        parts = member.name.split('/', 1)
        if len(parts) < 2:
            continue
        member.name = parts[1]
        if not member.name:
            continue
        tar.extract(member, OUT_DIR)

print(f'Extracted to: {os.path.abspath(OUT_DIR)}')
files = os.listdir(OUT_DIR)
print('Files:', files)

# Cleanup
try:
    os.remove(TAR_PATH)
    print('Cleaned up tar file.')
except: pass

# Quick test
print('\nQuick test...')
try:
    import sherpa_onnx
    model_file = os.path.join(OUT_DIR, 'model.onnx')
    tokens_file = os.path.join(OUT_DIR, 'tokens.txt')
    
    if not os.path.exists(model_file):
        # Look for onnx file
        for f in files:
            if f.endswith('.onnx'):
                model_file = os.path.join(OUT_DIR, f)
                break
    if not os.path.exists(tokens_file):
        for f in files:
            if 'token' in f.lower():
                tokens_file = os.path.join(OUT_DIR, f)
                break

    print(f'  model: {model_file}')
    print(f'  tokens: {tokens_file}')
    
    tts_config = sherpa_onnx.OfflineTtsConfig(
        model=sherpa_onnx.OfflineTtsModelConfig(
            vits=sherpa_onnx.OfflineTtsVitsModelConfig(
                model=model_file,
                tokens=tokens_file,
            ),
            num_threads=2,
            debug=False,
        ),
        rule_fsts='',
        max_num_sentences=1,
    )
    tts = sherpa_onnx.OfflineTts(tts_config)
    audio = tts.generate('Xin chao ban.', sid=0, speed=1.0)
    print(f'  Generated audio: {len(audio.samples)} samples @ {audio.sample_rate}Hz')
    print('  TEST PASS!')
except Exception as e:
    print(f'  Test error: {e}')

print('\nDone. Model is ready at:', os.path.abspath(OUT_DIR))
