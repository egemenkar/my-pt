# My PT

Kişisel, internetsiz çalışan bir fitness PWA'sı: 31 haftalık ekipmansız ev programı, beslenme alışkanlıkları, ölçü takibi ve ölçülere göre şekillenen 3D vücut.

Tüm veriler sadece kullanılan cihazın tarayıcısında (localStorage) saklanır; sunucuya hiçbir şey gönderilmez.

## Yayınlama

Statik bir sitedir; GitHub Pages ile yayınlanır. Bir dosya değiştirdikten sonra telefondaki uygulamanın yeni sürümü alması için:

```bash
python3 scripts/build-sw.py
```

## Kaynaklar ve lisanslar

- Egzersiz fotoğrafları: [free-exercise-db](https://github.com/yuhonas/free-exercise-db) (Unlicense)
- 3D vücut modeli: [Anny](https://github.com/naver/anny), NAVER LABS Europe, Apache 2.0 (`body/LICENSE-Anny.txt`); MakeHuman verileri CC0 1.0. `body/body.bin`, `tools/anny/export_body.py` ile Anny'den üretilmiştir.
- 3D görüntüleme: [three.js](https://threejs.org) r170, MIT (`vendor/three/LICENSE`)
