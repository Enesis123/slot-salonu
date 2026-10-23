// Altın Madeni: 6 makara, her dönüşte her makara 2-7 sıra. Soldan bitişik makaralarda
// eşleşen sembol sayılarının çarpımı = yol sayısı. Kazananlar patlar, yenileri düşer.
// Bedava dönüşte her patlamada çarpan +1 artar ve sıfırlanmaz.
(function (root) {
  'use strict';
  const L = root.SlotLogic;
  const REELS = 6;
  const HEIGHTS = L.picker([
    { v: 2, w: 1 }, { v: 3, w: 3 }, { v: 4, w: 4 }, { v: 5, w: 4 }, { v: 6, w: 3 }, { v: 7, w: 2 },
  ]);
  // pay: [3, 4, 5, 6 makara] — toplam bahsin katı, yol başına (SCALE ile çarpılır)
  const SYMS = [
    { s: 'bag',     e: '💰', name: 'Altın Kesesi', pay: [0.5, 1.5, 4, 20],    w: 4 },
    { s: 'cup',     e: '🏆', name: 'Kupa',         pay: [0.4, 1, 2.5, 10],    w: 5 },
    { s: 'ring',    e: '💍', name: 'Yüzük',        pay: [0.3, 0.75, 1.5, 5],  w: 6 },
    { s: 'key',     e: '🔑', name: 'Anahtar',      pay: [0.25, 0.5, 1, 4],    w: 7 },
    { s: 'spade',   e: '♠️', name: 'Maça',         pay: [0.1, 0.2, 0.4, 1.5], w: 9 },
    { s: 'heart',   e: '♥️', name: 'Kupa (kart)',  pay: [0.1, 0.2, 0.4, 1.5], w: 9 },
    { s: 'diamond', e: '♦️', name: 'Karo',         pay: [0.05, 0.1, 0.25, 1], w: 10 },
    { s: 'club',    e: '♣️', name: 'Sinek',        pay: [0.05, 0.1, 0.25, 1], w: 10 },
  ];
  const WILD = { s: 'wild', e: '🃏', name: 'Joker' };
  const SC = { s: 'sc', e: '💎', name: 'Elmas' };
  const W = { wild: 2.5, sc: 0.85, scFs: 0.8 };
  const SCALE = 0.078;

  // Joker yalnız 2-5. makaralarda çıkar
  const pickEdge = L.picker([...SYMS, { ...SC, w: W.sc }]);
  const pickMid = L.picker([...SYMS, { ...SC, w: W.sc }, { ...WILD, w: W.wild }]);
  const pickEdgeFs = L.picker([...SYMS, { ...SC, w: W.scFs }]);
  const pickMidFs = L.picker([...SYMS, { ...SC, w: W.scFs }, { ...WILD, w: W.wild }]);

  function make(rng, c, fs) {
    const edge = c === 0 || c === REELS - 1;
    const p = fs ? (edge ? pickEdgeFs : pickMidFs) : (edge ? pickEdge : pickMid);
    return { id: L.uid(), s: p(rng).s };
  }

  function evaluate(g, bet) {
    const wins = [];
    for (const sym of SYMS) {
      let ways = 1, k = 0;
      const ids = [];
      for (let c = 0; c < REELS; c++) {
        let cnt = 0;
        for (const cell of g[c]) {
          if (cell.s === sym.s || cell.s === 'wild') { cnt++; ids.push(cell.id); }
        }
        if (!cnt) break;
        ways *= cnt; k++;
      }
      if (k >= 3) {
        // Sondaki eşleşmeyen makaranın hücreleri ids'e girmedi; sadece ilk k makara toplandı
        wins.push({ s: sym.s, k, ways, ids, amount: sym.pay[k - 3] * ways * bet * SCALE });
      }
    }
    return wins;
  }

  function spin(bet, rng, fs, state) {
    const heights = [];
    for (let c = 0; c < REELS; c++) heights.push(HEIGHTS(rng).v);
    let g = heights.map((h, c) => {
      const col = [];
      for (let r = 0; r < h; r++) col.push(make(rng, c, fs));
      return col;
    });
    let mult = fs ? state.mult : 1;
    let total = 0;
    const steps = [];
    for (;;) {
      const wins = evaluate(g, bet);
      const raw = wins.reduce((a, w) => a + w.amount, 0);
      steps.push({ grid: g, wins, win: raw * mult, mult });
      if (!wins.length) break;
      total += raw * mult;
      const dead = new Set();
      for (const w of wins) for (const id of w.ids) dead.add(id);
      g = g.map((col, c) => {
        const keep = col.filter((x) => !dead.has(x.id));
        const add = [];
        for (let i = keep.length; i < heights[c]; i++) add.push(make(rng, c, fs));
        return add.concat(keep);
      });
      if (fs) { mult++; state.mult = mult; }
    }
    let scN = 0;
    const scIds = [];
    for (const col of g) for (const cell of col) if (cell.s === 'sc') { scN++; scIds.push(cell.id); }
    const fsAward = fs ? (scN >= 3 ? 5 : 0) : (scN >= 4 ? 12 + 5 * (scN - 4) : 0);
    return {
      steps, heights, ways: heights.reduce((a, b) => a * b, 1),
      scN, scIds, fsAward, total: Math.round(total),
    };
  }

  L.megaways = {
    REELS, SYMS, WILD, SC, SCALE, BY: L.bySymbol([...SYMS, WILD, SC]),
    FS: 12, BUY: 100, spin,
    randomGrid: (rng) => spin(1, rng, false, null).steps[0].grid,
  };
})(typeof window !== 'undefined' ? window : globalThis);
