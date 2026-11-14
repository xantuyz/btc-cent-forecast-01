# btc-cent-forecast-01 — Forecaster BTC 4 Jam

Program membaca 72 jam harga BTC per menit (4.320 close) sampai checkpoint dan
menulis SATU angka: prediksi harga 240 menit setelah checkpoint.

## Metode — mean-reversion dua skala dengan gate volatilitas

Skor adalah MAE, jadi tebakan = median kondisional: harga checkpoint ditambah
drift kecil yang sangat diredam. Return 4-jam ber-autokorelasi lag-1 negatif
(pooled ~−0,32 di window practice), begitu pula skala 24 jam, jadi gerakan besar
yang baru terjadi cenderung berbalik sebagian — tapi hanya bila gerakan itu besar
relatif terhadap volatilitas bloknya sendiri (gate `g = z²/(1+z²)`).

```
r4  = ln(last / harga 240 mnt lalu),   r24 = ln(last / harga 1440 mnt lalu)
sigma4  = SD return blok overlapping 4-jam, disampling tiap jam
sigma24 = SD return blok overlapping 24-jam, disampling tiap 4 jam
g4  = z4²/(1+z4²),  z4  = |r4|  / sigma4
g24 = z24²/(1+z24²), z24 = |r24| / sigma24
drift = -0.40 * g4 * r4 - 0.25 * g24 * r24
guess = last * exp(clamp(drift, -0.008, +0.008)), dibulatkan 5 desimal
```

Loading (0,40 / 0,25) duduk di tengah plateau datar, bukan hasil tune ke angka
practice. Stdlib saja, offline, deterministik, tanpa network dan tanpa model call.

## Hasil validasi

| Uji | Model | Persistence (baseline) |
|---|---|---|
| Practice-5 (p00–p04) | MAE **$492,55** (49.254,52 sen) | MAE **$470,55** (47.054,66 sen) |
| Rolling 60 target (origin tiap 4 jam) | MAE **$363,69** | MAE **$405,21** (−10,2%), menang 27/60 |
| Rolling ke-2, 40 target (origin tiap 2 jam, p00+p02) | MAE **$445,78** | MAE **$537,56** (−17,1%), menang 24/40 |

Model tampil lebih buruk di practice-5 (n=5, didominasi satu case p02) — hal yang
sudah diperkirakan — tetapi kedua varian rolling setuju model lebih baik dari
persistence, jadi model inilah yang di-submit: persistence persis = baseline,
peluang menang nol.

Format: ke-6 practice case lolos cek ketat (1 baris, 51 byte, price 5 desimal,
0 < price < 10.000.000). Determinisme: 2 run byte-identik. Waktu ~190–206 ms/case
(batas 8 detik).

## Menjalankan

```sh
mkdir -p out && MAKEFUN_INPUT_DIR=<kit>/input MAKEFUN_OUTPUT_DIR=out node main.ts
```
