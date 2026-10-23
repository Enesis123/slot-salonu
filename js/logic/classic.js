// Klasik Meyve: 3 makara, 3 sıra, 5 çizgi. Kiraz ilk iki makarada da öder.
(function (root) {
  'use strict';
  const L = root.SlotLogic;
  const REELS = 3, ROWS = 3, NLINES = 5;
  const LINES = [[1, 1, 1], [0, 0, 0], [2, 2, 2], [0, 1, 2], [2, 1, 0]];
  // pay: adet → çizgi bahsinin katı
  const SYMS = [
    { s: 'seven',  e: '7',   name: 'Yedi',   pay: { 3: 500 }, w: 2 },
    { s: 'bar',    e: 'BAR', name: 'BAR',    pay: { 3: 120 },  w: 3 },
    { s: 'bell',   e: '🔔',  name: 'Çan',    pay: { 3: 65 },  w: 4 },
    { s: 'melon',  e: '🍉',  name: 'Karpuz', pay: { 3: 45 },  w: 5 },
    { s: 'lemon',  e: '🍋',  name: 'Limon',  pay: { 3: 20 },  w: 6 },
    { s: 'plum',   e: '🍇',  name: 'Üzüm',   pay: { 3: 20 },  w: 6 },
    { s: 'cherry', e: '🍒',  name: 'Kiraz',  pay: { 2: 3, 3: 15 }, w: 7 },
  ];
  const pick = L.picker(SYMS);
  const BY = L.bySymbol(SYMS);

  function spin(bet, rng) {
    const lb = bet / NLINES;
    const g = [];
    for (let c = 0; c < REELS; c++) {
      const col = [];
      for (let r = 0; r < ROWS; r++) col.push(pick(rng).s);
      g.push(col);
    }
    const lineWins = [];
    LINES.forEach((ln, li) => {
      const first = g[0][ln[0]];
      let n = 1;
      while (n < REELS && g[n][ln[n]] === first) n++;
      const p = BY[first].pay[n];
      if (p) lineWins.push({ line: li, s: first, n, amount: p * lb, cells: ln.slice(0, n).map((r, c) => [c, r]) });
    });
    const total = lineWins.reduce((a, w) => a + w.amount, 0);
    return { grid: g, lineWins, scN: 0, scCells: [], scatterWin: 0, expand: null, fsAward: 0, total: Math.round(total) };
  }

  L.classic = { REELS, ROWS, LINES, SYMS, BY, spin, randomSymbol: (rng) => pick(rng).s };
})(typeof window !== 'undefined' ? window : globalThis);
