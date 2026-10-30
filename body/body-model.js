// Anny tabanlı vücut modeli: yükleme, şekil karışımı, ölçülere uydurma ve halka ölçümü.
// Veri: tools/anny/export_body.py ile üretilen body.bin + body.json

const LOCAL_KEYS = ["waist", "chest", "hip", "arm", "thigh", "belly"];
export const MEASURE_KEYS = ["waist", "chest", "hip", "arm", "thigh"];

export async function loadBody(base = "body/") {
  const [meta, bin] = await Promise.all([
    fetch(base + "body.json").then(r => r.json()),
    fetch(base + "body.bin").then(r => r.arrayBuffer())
  ]);
  const N = meta.vertexCount;
  const o = meta.offsets;
  return {
    meta,
    N,
    positions: new Float32Array(bin, o.positions, N * 3),
    indices: new Uint16Array(bin, o.indices, meta.triangleCount * 3),
    shorts: new Int16Array(bin, o.shorts, N), // şort sınırına uzaklık (mm), pozitif = şort
    deltas: new Int16Array(bin, o.deltas, meta.targets.length * N * 3),
    muscle: o.muscle != null ? new Uint8Array(bin, o.muscle, N) : null // köşe başına kas grubu (meta.muscles sırası)
  };
}

// Kilo ve kas ızgarasında (0, 0,5, 1) çift doğrusal ağırlıklar → node şekillerinin katsayıları
function gridWeights(w, m) {
  const seg = v => (v <= 0.5 ? [0, 0.5, v / 0.5] : [0.5, 1, (v - 0.5) / 0.5]);
  const [w0, w1, tw] = seg(Math.min(1, Math.max(0, w)));
  const [m0, m1, tm] = seg(Math.min(1, Math.max(0, m)));
  return [
    [w0, m0, (1 - tw) * (1 - tm)], [w1, m0, tw * (1 - tm)],
    [w0, m1, (1 - tw) * tm], [w1, m1, tw * tm]
  ];
}

// Izgaradaki bir ölçünün (w, m) için çift doğrusal tahmini
function nodeMeasure(body, key, w, m) {
  const f = v => (v === 0.5 ? "0.5" : v.toFixed(1)); // body.json anahtarları: "0.0,1.0" gibi
  return gridWeights(w, m).reduce((s, [nw, nm, k]) => s + k * body.meta.nodeMeasures[`${f(nw)},${f(nm)}`][key], 0);
}

// Şekil katsayılarını hedef listesine göre çıkar
function influences(body, p) {
  const infl = new Float32Array(body.meta.targets.length);
  const gw = gridWeights(p.w, p.m);
  body.meta.targets.forEach((t, i) => {
    if (t.kind === "node") {
      const g = gw.find(([nw, nm]) => nw === t.w && nm === t.m);
      if (g) infl[i] = g[2];
    } else {
      const v = p.local[t.key] || 0;
      if ((t.sign > 0 && v > 0) || (t.sign < 0 && v < 0)) infl[i] = Math.abs(v);
    }
  });
  return infl;
}

// Parametrelerden köşe konumlarını üretir (metre, ayaklar y=0)
export function buildPositions(body, p, out) {
  const { N, positions, deltas } = body;
  const dst = out || new Float32Array(N * 3);
  dst.set(positions);
  const infl = influences(body, p);
  const sc = body.meta.deltaScale;
  for (let t = 0; t < infl.length; t++) {
    const k = infl[t] * sc;
    if (!k) continue;
    const off = t * N * 3;
    for (let i = 0; i < N * 3; i++) dst[i] += k * deltas[off + i];
  }
  if (p.scale !== 1) for (let i = 0; i < N * 3; i++) dst[i] *= p.scale;
  return dst;
}

export function loopPoints(body, pos, key) {
  return body.meta.loops[key].map(([a, b, t]) => [
    pos[a * 3] + t * (pos[b * 3] - pos[a * 3]),
    pos[a * 3 + 1] + t * (pos[b * 3 + 1] - pos[a * 3 + 1]),
    pos[a * 3 + 2] + t * (pos[b * 3 + 2] - pos[a * 3 + 2])
  ]);
}

export function perimeter(points) {
  let s = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    s += Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  }
  return s;
}

export function measureAll(body, pos) {
  const out = {};
  MEASURE_KEYS.forEach(k => { out[k] = perimeter(loopPoints(body, pos, k)) * 100; });
  return out; // cm
}

// Kullanıcı ölçülerinden model parametreleri.
// m: { heightCm, kg?, fat?, waist?, chest?, hip?, arm? } (cm)
export function fitBody(body, m) {
  const H = (m.heightCm || 178) / 100;
  const circs = MEASURE_KEYS.filter(k => m[k]).map(k => [k, m[k] / 100]);
  // Yağ oranından kas için öncül: %28 → ~0,2, %15 → ~0,6
  const m0 = m.fat ? Math.min(0.95, Math.max(0.05, 0.5 + (18 - m.fat) / 35)) : 0.5;
  let best = null;
  for (let w = 0; w <= 1.0001; w += 0.01) {
    for (let mu = 0; mu <= 1.0001; mu += 0.02) {
      const s = H / nodeMeasure(body, "height", w, mu);
      let loss = ((mu - m0) / 0.25) ** 2 * 0.3;
      if (m.kg) {
        const mass = nodeMeasure(body, "volume", w, mu) * s ** 3 * body.meta.density;
        loss += ((mass - m.kg) / m.kg) ** 2 * 40;
      }
      // Göbek ölçüsü genel vücudu az etkilesin; fazlası aşağıda göbek şekline verilir
      circs.forEach(([k, v]) => { loss += ((nodeMeasure(body, k, w, mu) * s - v) / v) ** 2 * (k === "waist" ? 2 : 10); });
      if (!best || loss < best.loss) best = { loss, w, m: mu, scale: s };
    }
  }
  const p = { w: best.w, m: best.m, scale: best.scale, local: Object.fromEntries(LOCAL_KEYS.map(k => [k, 0])) };

  // Çevre ölçülerinin kalan farkını ölçü ayarlarıyla kapat (birkaç tur)
  if (circs.length) {
    const sens = (key, measure, sign) => body.meta.localSens[key][sign > 0 ? "1" : "-1"][measure] * p.scale * (sign > 0 ? 1 : -1);
    const pos = new Float32Array(body.N * 3);
    for (let iter = 0; iter < 4; iter++) {
      buildPositions(body, p, pos);
      circs.forEach(([k, v]) => {
        const cur = perimeter(loopPoints(body, pos, k));
        const diff = v - cur;
        if (k === "waist") {
          // Göbek hizasındaki fazlalığın çoğu öne doğru göbek olarak, kalanı genel bel ayarından
          const sb = Math.abs(sens("belly", "waist", 1));
          const sw = Math.abs(sens("waist", "waist", Math.sign(diff) || 1));
          const belly = Math.min(1, Math.max(-0.3, p.local.belly + (diff * 0.85) / sb));
          const used = (belly - p.local.belly) * sb;
          p.local.belly = belly;
          p.local.waist = Math.min(1, Math.max(-1, p.local.waist + (diff - used) / sw));
        } else {
          const sign = Math.sign(p.local[k] + diff) || 1;
          p.local[k] = Math.min(1, Math.max(-1, p.local[k] + diff / Math.abs(sens(k, k, sign))));
        }
      });
    }
  }
  return p;
}

export function lerpParams(a, b, t) {
  const L = x => a[x] + (b[x] - a[x]) * t;
  return {
    w: L("w"), m: L("m"), scale: L("scale"),
    local: Object.fromEntries(LOCAL_KEYS.map(k => [k, (a.local[k] || 0) + ((b.local[k] || 0) - (a.local[k] || 0)) * t]))
  };
}
