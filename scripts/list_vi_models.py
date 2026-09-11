import urllib.request, json, io, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

url = 'https://api.github.com/repos/k2-fsa/sherpa-onnx/releases/tags/tts-models'
req = urllib.request.Request(url, headers={
    'User-Agent': 'Mozilla/5.0',
    'Accept': 'application/vnd.github+json'
})
with urllib.request.urlopen(req, timeout=30) as r:
    data = json.loads(r.read())

assets = data.get('assets', [])
vi_assets = [a for a in assets if 'vi' in a['name'].lower()]
print('Total assets:', len(assets))
print('Vietnamese assets:')
for a in vi_assets:
    size_kb = a['size'] // 1024
    name = a['name']
    url2 = a['browser_download_url']
    print(name, '-', size_kb, 'KB')
    print('   ', url2)
