"""sw.js içindeki dosya listesini ve önbellek sürümünü yeniler.

Uygulamada bir dosya değiştirdikten sonra yayınlamadan önce çalıştır:
    python3 scripts/build-sw.py
"""
import hashlib
import json
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
FILES = ["./", "index.html", "body.html", "manifest.webmanifest"]
FILES += sorted(str(p.relative_to(ROOT)) for p in (ROOT / "icons").iterdir() if p.is_file())
FILES += sorted(str(p.relative_to(ROOT)) for p in (ROOT / "img").rglob("*") if p.is_file())
for folder in ("body", "vendor"):
    FILES += sorted(str(p.relative_to(ROOT)) for p in (ROOT / folder).rglob("*") if p.is_file() and p.name != "LICENSE")

digest = hashlib.sha1()
for f in FILES[1:]:
    digest.update((ROOT / f).read_bytes())
version = digest.hexdigest()[:10]

template = (ROOT / "scripts" / "sw.template.js").read_text(encoding="utf-8")
out = template.replace("__VERSION__", version).replace("__FILES__", json.dumps(FILES, indent=2))
(ROOT / "sw.js").write_text(out, encoding="utf-8")
print(f"sw.js güncellendi: {len(FILES)} dosya, sürüm {version}")
