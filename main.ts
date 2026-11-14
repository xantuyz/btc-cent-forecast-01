// btc-cent-forecast-01 — forecaster dua-skala mean-reversion (Node 22, stdlib saja).
//
// Membaca 72 jam harga BTC per menit (4.320 close) sampai checkpoint, menulis SATU
// angka: prediksi harga 240 menit setelah checkpoint.
//
// Metode: mean-reversion dua skala dengan gate volatilitas. MAE adalah proper scoring
// rule untuk satu angka, jadi tebakan = median kondisional: harga checkpoint ditambah
// drift kecil yang sangat diredam. Return 4-jam ber-autokorelasi lag-1 negatif
// (pooled ~-0,32 di window practice), begitu pula skala 24 jam, jadi gerakan besar
// yang baru terjadi cenderung berbalik sebagian — tapi hanya bila gerakan itu besar
// relatif terhadap volatilitas bloknya sendiri (gate g = z^2/(1+z^2)).
//
//   r4  = ln(last / harga 240 mnt lalu),   r24 = ln(last / harga 1440 mnt lalu)
//   sigma4  = SD return blok overlapping 4-jam, disampling tiap jam
//   sigma24 = SD return blok overlapping 24-jam, disampling tiap 4 jam
//   g4  = z4^2/(1+z4^2),  z4  = |r4|  / sigma4
//   g24 = z24^2/(1+z24^2), z24 = |r24| / sigma24
//   drift = -0.40 * g4 * r4 - 0.25 * g24 * r24
//   guess = last * exp(clamp(drift, -0.008, +0.008)), dibulatkan 5 desimal
//
// Loading (0,40 / 0,25) duduk di tengah plateau datar, bukan hasil tune ke angka
// practice. Offline, deterministik, tanpa network dan tanpa model call: tidak ada
// randomness, jam, atau urutan yang bergantung lingkungan — dua run menulis byte
// yang sama untuk input yang sama.

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const INPUT_DIR = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const OUTPUT_DIR = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

/** Harga terkecil pada grid 5 desimal. */
const MIN_PRICE = 0.00001;
/** Harga grid terbesar di bawah batas eksklusif scorer 10.000.000. */
const MAX_PRICE = 9_999_999.99999;

interface CaseMarket {
  id: string;
  prices: number[];
}

interface Case {
  markets: CaseMarket[];
}

/** x dijaga pada grid 5 desimal dan di dalam (0, 10.000.000). */
const price5 = (x: number): number =>
  Math.round(Math.min(MAX_PRICE, Math.max(MIN_PRICE, x)) * 1e5) / 1e5;

/** clamp(x, lo, hi). */
const clamp = (x: number, lo: number, hi: number): number =>
  x < lo ? lo : x > hi ? hi : x;

/**
 * Simpangan baku (sampel, ddof=1) dari return log blok overlapping.
 * Blok berakhir di indeks `end`, mundur dengan langkah `step`, dan tiap blok
 * mencakup `span` menit ke belakang: r = ln(p[end] / p[end - span]).
 */
function blockReturnSd(prices: number[], span: number, step: number): number {
  const n = prices.length;
  const rs: number[] = [];
  for (let end = n - 1; end >= span; end -= step) {
    const a = prices[end - span] as number;
    const b = prices[end] as number;
    if (a > 0 && b > 0 && Number.isFinite(a) && Number.isFinite(b)) {
      const r = Math.log(b / a);
      if (Number.isFinite(r)) rs.push(r);
    }
  }
  if (rs.length < 2) return 0;
  const mean = rs.reduce((s, v) => s + v, 0) / rs.length;
  const ss = rs.reduce((s, v) => s + (v - mean) * (v - mean), 0);
  return Math.sqrt(ss / (rs.length - 1));
}

/** Prediksi satu market: harga 240 menit setelah checkpoint. */
function forecast(m: CaseMarket): number {
  if (!Array.isArray(m.prices) || m.prices.length === 0) {
    throw new Error(`market ${m.id} has no prices`);
  }
  const p = m.prices;
  const n = p.length;
  const last = p[n - 1] as number;
  if (typeof last !== 'number' || !Number.isFinite(last) || last <= 0) {
    throw new Error(`market ${m.id}'s last price is not a finite positive number`);
  }

  // Gerakan log 4 jam dan 24 jam terakhir; bila series terlalu pendek, drift 0.
  const r4 = n > 240 && (p[n - 1 - 240] as number) > 0
    ? Math.log(last / (p[n - 1 - 240] as number))
    : 0;
  const r24 = n > 1440 && (p[n - 1 - 1440] as number) > 0
    ? Math.log(last / (p[n - 1 - 1440] as number))
    : 0;

  // Volatilitas blok: 4-jam disampling tiap jam, 24-jam tiap 4 jam.
  const sigma4 = blockReturnSd(p, 240, 60);
  const sigma24 = blockReturnSd(p, 1440, 240);

  // Gate: gerakan kecil relatif terhadap volatilitas hampir tidak di-fade,
  // gerakan besar (z >> 1) di-fade penuh. Tanpa volatilitas, gate mati (drift 0).
  const gate = (r: number, sigma: number): number => {
    if (sigma <= 0) return 0;
    const z = Math.abs(r) / sigma;
    const z2 = z * z;
    return z2 / (1 + z2);
  };

  const drift = -0.4 * gate(r4, sigma4) * r4 - 0.25 * gate(r24, sigma24) * r24;
  return price5(last * Math.exp(clamp(drift, -0.008, 0.008)));
}

mkdirSync(OUTPUT_DIR, { recursive: true });
// Setiap file case, urut nama, supaya dua run menulis byte yang sama.
const inputs = readdirSync(INPUT_DIR).filter((f) => f.endsWith('.in')).sort();
for (const file of inputs) {
  const id = file.slice(0, -'.in'.length);
  const c = JSON.parse(readFileSync(join(INPUT_DIR, file), 'utf8')) as Case;
  if (!Array.isArray(c.markets) || c.markets.length !== 1) {
    throw new Error(`${file} does not hold exactly one market`);
  }
  writeFileSync(
    join(OUTPUT_DIR, `${id}.out`),
    `${JSON.stringify({ forecasts: [{ case: id, price: forecast(c.markets[0] as CaseMarket) }] })}\n`,
  );
}
