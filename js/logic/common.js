// Oyun mantıklarının ortak yardımcıları — tarayıcıda da Node simülasyonunda da çalışır
(function (root) {
  'use strict';
  const L = (root.SlotLogic = root.SlotLogic || {});

  // Her sembol örneğine benzersiz kimlik: düşme animasyonu bunu takip ediyor
  let uid = 0;
  L.uid = () => ++uid;

  // Ağırlıklı rastgele seçici; birikimli toplam önceden hesaplanır
  L.picker = function (items) {
    const cum = [];
    let total = 0;
    for (const it of items) { total += it.w; cum.push(total); }
    return function (rng) {
      const r = rng() * total;
      for (let i = 0; i < cum.length; i++) if (r < cum[i]) return items[i];
      return items[items.length - 1];
    };
  };

  // Anahtara göre bir kez hesaplayıp saklar (şans katsayısına özel seçiciler için)
  L.cached = function (fn) {
    const m = new Map();
    return (k) => { if (!m.has(k)) m.set(k, fn(k)); return m.get(k); };
  };

  // Şans katsayısı: listenin sonundaki (büyük) değerlerin ağırlığını kademeli artırır
  L.luckyValues = function (values, luck) {
    const n = values.length - 1;
    return values.map((x, i) => ({ ...x, w: x.w * Math.pow(luck, (2 * i) / n) }));
  };

  L.bySymbol = function (list) {
    const map = {};
    for (const it of list) map[it.s] = it;
    return map;
  };
})(typeof window !== 'undefined' ? window : globalThis);
