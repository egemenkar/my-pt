"""Anny vücut modelini My PT için tarayıcıda kullanılacak ikili dosyaya aktarır.

Çıktı: ../../body/body.bin ve ../../body/body.json

İçerik:
- Temel şekil (kilo 0,5 · kas 0,5) ve 8 köşe şekli: kilo ve kas {0, 0,5, 1} ızgarası.
  Anny bu iki parametrede parça parça doğrusal karıştığı için tarayıcıda ızgara
  içinde çift doğrusal karışım birebir doğru sonuç verir.
- Ölçü ayarları (MakeHuman "measure-*" ve göbek): artırma ve azaltma farkları.
- Ölçüm halkaları: [köşe a, köşe b, t] noktaları; her şekilde aynı yerden ölçülür.
- Şort bölgesi (vertex rengi).

Çalıştırma:  .venv/bin/python export_body.py
Model: Anny (NAVER LABS Europe, Apache 2.0), MakeHuman verileri CC0.
"""
import json
import math
import pathlib
import warnings

import numpy as np
import torch

warnings.filterwarnings("ignore")
import anny  # noqa: E402

OUT = pathlib.Path(__file__).resolve().parent.parent.parent / "body"
AGE = 0.72  # yaklaşık 35 yaş (genç = 2/3 ≈ 25 yaş, yaşlı = 1 ≈ 90 yaş)
FIXED = dict(gender=0.0, age=AGE, height=0.5, proportions=0.5)  # gender 0 = erkek
GRID = (0.0, 0.5, 1.0)
LOCALS = [
    ("waist", "measure-waist-circ-incr"),
    ("chest", "measure-bust-circ-incr"),
    ("hip", "measure-hips-circ-incr"),
    ("arm", "measure-upperarm-circ-incr"),
    ("thigh", "measure-thigh-circ-incr"),
    ("belly", "stomach-pregnant-incr"),
]
ARM_DROP_DEG = 30  # kolları biraz daha aşağı indir

model = anny.create_fullbody_model(triangulate_faces=True, local_changes="default")
faces = model.faces.cpu().numpy().astype(np.int64)
bones = list(model.bone_labels)


def rot_y(deg):
    a = math.radians(deg)
    c, s = math.cos(a), math.sin(a)
    r = torch.eye(4, dtype=torch.float64)
    r[2, 2], r[2, 0], r[0, 2], r[0, 0] = c, s, -s, c
    return r[None]


POSE = {"upperarm01.L": rot_y(-ARM_DROP_DEG), "upperarm01.R": rot_y(ARM_DROP_DEG)}


def run(weight=0.5, muscle=0.5, local=None):
    out = model(
        pose_parameters={k: v.to(model.dtype) for k, v in POSE.items()},
        phenotype_kwargs={**FIXED, "weight": weight, "muscle": muscle},
        local_changes_kwargs=local or {},
    )
    verts = out["vertices"][0].detach().double().cpu().numpy()
    # Kemik başının pozlanmış konumu: dinlenme pozunda başı çevreleyen köşelerin,
    # pozlanmış mesh'teki ortalaması (kütüphanenin dönüşüm kuralından bağımsız)
    rest_v = out["rest_vertices"][0].detach().double().cpu().numpy()
    rest_h = out["rest_bone_heads"][0].detach().double().cpu().numpy()
    heads = np.empty_like(rest_h)
    for i, h in enumerate(rest_h):
        d = np.linalg.norm(rest_v - h, axis=1)
        near = d < max(0.04, np.sort(d)[12])
        heads[i] = verts[near].mean(0)
    return verts, heads


base, heads = run()
head_of = lambda name: heads[bones.index(name)]  # noqa: E731
N = base.shape[0]


# ---------- Düzlem kesiti ile ölçüm halkası ----------
def plane_loops(verts, origin, normal):
    """Mesh'i düzlemle keser; kapalı halkaları [(a, b, t), ...] listesi olarak döndürür."""
    d = (verts - origin) @ normal
    segs = []
    for f in faces:
        pts = []
        for i in range(3):
            a, b = f[i], f[(i + 1) % 3]
            if (d[a] > 0) != (d[b] > 0):
                t = d[a] / (d[a] - d[b])
                key = (min(a, b), max(a, b))
                pts.append((key, (a, b, float(t))))
        if len(pts) == 2:
            segs.append(pts)
    # Kenar anahtarları üzerinden zincirle
    adj = {}
    for (k1, p1), (k2, p2) in segs:
        adj.setdefault(k1, []).append((k2, p2))
        adj.setdefault(k2, []).append((k1, p1))
    point_of = {}
    for (k1, p1), (k2, p2) in segs:
        point_of[k1], point_of[k2] = p1, p2
    seen, loops = set(), []
    for start in adj:
        if start in seen:
            continue
        loop, prev, cur = [], None, start
        while cur not in seen:
            seen.add(cur)
            loop.append(point_of[cur])
            nxt = [k for k, _ in adj[cur] if k != prev and k not in seen]
            if not nxt:
                break
            prev, cur = cur, nxt[0]
        if len(loop) > 8:
            loops.append(loop)
    return loops


def loop_points(verts, loop):
    a = np.array([p[0] for p in loop])
    b = np.array([p[1] for p in loop])
    t = np.array([p[2] for p in loop])[:, None]
    return verts[a] + t * (verts[b] - verts[a])


def perimeter(verts, loop):
    p = loop_points(verts, loop)
    return float(np.linalg.norm(np.roll(p, 1, axis=0) - p, axis=1).sum())


def pick(loops, verts, target):
    return min(loops, key=lambda lp: np.linalg.norm(loop_points(verts, lp).mean(0) - target))


up = np.array([0.0, 0.0, 1.0])
center_x = 0.0
crotch_z = min(head_of("upperleg01.L")[2], head_of("upperleg01.R")[2]) - 0.06
knee_z = head_of("lowerleg01.L")[2]

loops = {}
# Bel: göbek deliği hizası (erkeklerde göbek yağını en iyi gösteren çevre).
# Göbek deliği = "stomach-navel-out" ayarının en çok oynattığı köşe.
navel_delta, _ = run(local={"stomach-navel-out": 1.0})
navel_i = int(np.linalg.norm(navel_delta - base, axis=1).argmax())
waist_z = float(base[navel_i, 2])
loops["waist"] = pick(plane_loops(base, np.array([0, 0, waist_z]), up), base, np.array([center_x, base[:, 1].mean(), waist_z]))

# Göğüs: meme ucu hizası (breast kemik başı)
chest_z = float((head_of("breast.L")[2] + head_of("breast.R")[2]) / 2) - 0.02
loops["chest"] = pick(plane_loops(base, np.array([0, 0, chest_z]), up), base, np.array([center_x, base[:, 1].mean(), chest_z]))

# Kalça: göbek ile apış arasında en geniş tek halka
best = None
for z in np.linspace(crotch_z + 0.03, waist_z - 0.04, 14):
    lp = pick(plane_loops(base, np.array([0, 0, z]), up), base, np.array([center_x, base[:, 1].mean(), z]))
    per = perimeter(base, lp)
    c = loop_points(base, lp).mean(0)
    if abs(c[0]) < 0.05 and (best is None or per > best[0]):
        best = (per, lp, z)
loops["hip"] = best[1]
hip_z = best[2]

# Gerçek apış: yukarıdan aşağı inerken gövde halkasının iki bacağa ayrıldığı ilk yükseklik
def leg_loops_at(z):
    ls = [lp for lp in plane_loops(base, np.array([0, 0, z]), up) if abs(loop_points(base, lp)[:, 0].mean()) < 0.3]
    return ls


for z in np.linspace(hip_z, knee_z, 80):
    if len(leg_loops_at(z)) >= 2:
        crotch_z = float(z)
        break

# Uyluk: apışın hemen altında, sol bacağın en kalın yeri (mezura talimatıyla aynı)
leg_x = head_of("upperleg01.L")[0]
best = None
for z in np.linspace(crotch_z - 0.015, crotch_z - 0.10, 12):
    cands = [lp for lp in plane_loops(base, np.array([0, 0, z]), up) if loop_points(base, lp)[:, 0].mean() * np.sign(leg_x) > 0.03]
    if not cands:
        continue
    lp = pick(cands, base, np.array([leg_x, base[:, 1].mean(), z]))
    per = perimeter(base, lp)
    if best is None or per > best[0]:
        best = (per, lp, z)
loops["thigh"] = best[1]
thigh_z = best[2]

# Kol: üst kolun ortası, pazunun tepesi (omuz–dirsek arasının %65'i), kola dik düzlem.
# "En kalın yer" araması omuz kasına kaydığı için sabit oran kullanılıyor.
sh, el = head_of("upperarm01.L"), head_of("lowerarm01.L")
arm_n = (el - sh) / np.linalg.norm(el - sh)
best = None
for r in (0.65,):
    mid = sh + r * (el - sh)
    lp = pick(plane_loops(base, mid, arm_n), base, mid)
    per = perimeter(base, lp)
    if np.linalg.norm(loop_points(base, lp).mean(0) - mid) < 0.05 and (best is None or per > best[0]):
        best = (per, lp, r)
loops["arm"] = best[1]
print("kol halkası oranı:", round(best[2], 2), "apış z:", round(crotch_z, 3), "uyluk z:", round(thigh_z, 3))

# ---------- Şekiller ----------
targets = []  # (meta, delta)
for mu in GRID:
    for w in GRID:
        if (w, mu) == (0.5, 0.5):
            continue
        v, _ = run(w, mu)
        targets.append(({"kind": "node", "w": w, "m": mu}, v - base))
for key, label in LOCALS:
    for sign in (1.0, -1.0):
        v, _ = run(local={label: sign})
        targets.append(({"kind": "local", "key": key, "sign": sign}, v - base))


def measures(verts):
    out = {k: perimeter(verts, lp) for k, lp in loops.items()}
    out["height"] = float(verts[:, 2].max() - verts[:, 2].min())
    tri = verts[faces]
    out["volume"] = float(abs(np.einsum("ij,ij->i", np.cross(tri[:, 0], tri[:, 1]), tri[:, 2]).sum() / 6.0))
    return out


node_measures = {"0.5,0.5": measures(base)}
local_sens = {}
for meta, delta in targets:
    if meta["kind"] == "node":
        node_measures[f'{meta["w"]},{meta["m"]}'] = measures(base + delta)
    else:
        local_sens.setdefault(meta["key"], {})[str(int(meta["sign"]))] = {
            k: v - node_measures["0.5,0.5"][k] for k, v in measures(base + delta).items() if k != "height"
        }

# ---------- Şort bölgesi ----------
# Her köşeyi en yakın kemik segmentine göre sınıfla: kol/el segmentine en yakınsa kol sayılır
def seg_dist(p, a, b):
    ab = b - a
    t = np.clip(((p - a) @ ab) / (ab @ ab), 0, 1)
    return np.linalg.norm(p - (a + t[:, None] * ab), axis=1)


arm_segs, body_segs = [], []
for side in ("L", "R"):
    chain = [head_of(f"upperarm01.{side}"), head_of(f"lowerarm01.{side}"), head_of(f"wrist.{side}"), head_of(f"finger3-3.{side}")]
    arm_segs += list(zip(chain[:-1], chain[1:]))
    leg = [head_of(f"pelvis.{side}"), head_of(f"upperleg01.{side}"), head_of(f"lowerleg01.{side}"), head_of(f"foot.{side}")]
    body_segs += list(zip(leg[:-1], leg[1:]))
spine = [head_of(b) for b in ("spine05", "spine04", "spine03", "spine02", "spine01")]
body_segs += list(zip(spine[:-1], spine[1:]))
d_arm = np.min([seg_dist(base, a, b) for a, b in arm_segs], axis=0)
d_body = np.min([seg_dist(base, a, b) for a, b in body_segs], axis=0)
is_arm = d_arm < d_body
shorts_top = waist_z - 0.06  # şort göbek deliğinin biraz altından başlar
shorts_bottom = crotch_z - 0.5 * (crotch_z - knee_z)
z = base[:, 2]
# Köşe başına sınıra uzaklık (mm): pozitif = şort. Tarayıcıda üçgen içinde
# doğrusal karışır, sınır düz ve keskin çıkar.
shorts = np.minimum(shorts_top - z, z - shorts_bottom)
shorts[is_arm] = -0.2
colors = np.clip(np.round(shorts * 1000), -32000, 32000).astype(np.int16)


# ---------- Koordinat dönüşümü: Anny (z yukarı, -y ön) → three.js (y yukarı, +z ön) ----------
def to_three(v):
    return np.stack([v[..., 0], v[..., 2], -v[..., 1]], axis=-1)


min_z = base[:, 2].min()
pos = to_three(base - np.array([0, 0, min_z]))
deltas = np.stack([to_three(d) for _, d in targets])
scale = float(np.abs(deltas).max() / 32767.0)
q = np.round(deltas / scale).astype(np.int16)

OUT.mkdir(parents=True, exist_ok=True)
blobs = [pos.astype(np.float32).tobytes(), faces.astype(np.uint16).tobytes(), colors.tobytes(), q.tobytes()]
offsets, cur = [], 0
for b in blobs:
    pad = (-cur) % 4
    offsets.append(cur + pad)
    cur += pad + len(b)
with open(OUT / "body.bin", "wb") as f:
    for off, b in zip(offsets, blobs):
        f.write(b"\0" * (off - f.tell()))
        f.write(b)

meta = {
    "source": "Anny (NAVER LABS Europe, Apache 2.0) · MakeHuman verileri CC0",
    "vertexCount": int(N),
    "triangleCount": int(len(faces)),
    "offsets": {"positions": offsets[0], "indices": offsets[1], "shorts": offsets[2], "deltas": offsets[3]},
    "deltaScale": scale,
    "targets": [t for t, _ in targets],
    "loops": {k: [[int(a), int(b), round(float(t), 5)] for a, b, t in lp] for k, lp in loops.items()},
    "nodeMeasures": node_measures,
    "localSens": local_sens,
    "levels": {"waist": waist_z - min_z, "chest": chest_z - min_z, "hip": hip_z - min_z, "thigh": thigh_z - min_z},
    "density": 980,
}
(OUT / "body.json").write_text(json.dumps(meta, separators=(",", ":")))
size = (OUT / "body.bin").stat().st_size + (OUT / "body.json").stat().st_size
print(f"{N} köşe, {len(faces)} üçgen, {len(targets)} şekil, {size / 1024:.0f} KB")
print("taban ölçüler:", {k: round(v, 3) for k, v in node_measures["0.5,0.5"].items()})
print("kol köşesi:", int(is_arm.sum()), "şort köşesi:", int((colors > 0).sum()))
