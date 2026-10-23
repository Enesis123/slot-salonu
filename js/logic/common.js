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

  L.bySymbol = function (list) {
    const map = {};
    for (const it of list) map[it.s] = it;
    return map;
  };
})(typeof window !== 'undefined' ? window : globalThis);
