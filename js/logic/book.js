// Firavunun Kitabı: 5x3, 10 çizgi. Kitap hem joker hem scatter.
// 3+ kitap → 10 bedava dönüş; başta seçilen özel sembol makaraları kaplayıp tüm çizgilerden öder.
(function (root) {
  'use strict';
  const L = root.SlotLogic;
  const REELS = 5, ROWS = 3, NLINES = 10;
  const LINES = [
    [1, 1, 1, 1, 1], [0, 0, 0, 0, 0], [2, 2, 2, 2, 2], [0, 1, 2, 1, 0], [2, 1, 0, 1, 2],
    [1, 0, 0, 0, 1], [1, 2, 2, 2, 1], [0, 0, 1, 2, 2], [2, 2, 1, 0, 0], [1, 2, 1, 0, 1],
  ];
  // pay: adet → çizgi bahsinin katı
  const SYMS = [
    { s: 'explorer', e: '🤠', name: 'Kâşif',   pay: { 2: 10, 3: 100, 4: 1000, 5: 5000 }, w: 3 },
    { s: 'crown',    e: '👑', name: 'Taç',     pay: { 2: 5, 3: 40, 4: 400, 5: 2000 },    w: 4 },
    { s: 'statue',   e: '🗿', name: 'Heykel',  pay: { 2: 5, 3: 30, 4: 100, 5: 750 },     w: 5 },
    { s: 'scarab',   e: '🪲', name: 'Bok böceği', pay: { 2: 5, 3: 30, 4: 100, 5: 750 },  w: 5 },
    { s: 'A',  e: 'A',  name: 'A',  pay: { 3: 6, 4: 40, 5: 150 }, w: 8 },
    { s: 'K',  e: 'K',  name: 'K',  pay: { 3: 6, 4: 40, 5: 150 }, w: 8 },
    { s: 'Q',  e: 'Q',  name: 'Q',  pay: { 3: 6, 4: 25, 5: 100 }, w: 9 },
    { s: 'J',  e: 'J',  name: 'J',  pay: { 3: 6, 4: 25, 5: 100 }, w: 9 },
    { s: 'T',  e: '10', name: '10', pay: { 3: 6, 4: 25, 5: 100 }, w: 9 },
  ];
  const BOOK = { s: 'book', e: '📕', name: 'Kitap', pay: { 3: 2, 4: 20, 5: 200 } };
  const W = { book: 1.5 };
  const pick = L.picker([...SYMS, { ...BOOK, w: W.book }]);
  // Bedava dönüşte şans katsayısı özel sembolün sıklığını çarpar
  const fsPick = L.cached((key) => {
    const [special, luck] = key.split('|');
    return L.picker([...SYMS.map((x) => (x.s === special ? { ...x, w: x.w * (1 + (+luck - 1) * 0.15) } : x)), { ...BOOK, w: W.book }]);
  });

  function spin(bet, rng, fs, state) {
    const lb = bet / NLINES;
    const p = fs && state && state.special ? fsPick(state.special + '|' + (state.luck || 1)) : pick;
    const g = [];
    for (let c = 0; c < REELS; c++) {
      const col = [];
      for (let r = 0; r < ROWS; r++) col.push(p(rng).s);
      g.push(col);
    }
    const lineWins = [];
    LINES.forEach((ln, li) => {
      let best = null;
      for (const sym of SYMS) {
        let n = 0, real = false;
        for (let c = 0; c < REELS; c++) {
          const s = g[c][ln[c]];
          if (s === sym.s) { n++; real = true; } else if (s === 'book') n++; else break;
        }
        const p = real && sym.pay[n];
        if (!p) continue;
        const amount = p * lb;
        if (!best || amount > best.amount) {
          best = { line: li, s: sym.s, n, amount, cells: ln.slice(0, n).map((r, c) => [c, r]) };
        }
      }
      if (best) lineWins.push(best);
    });
    const scCells = [];
    g.forEach((col, c) => col.forEach((s, r) => { if (s === 'book') scCells.push([c, r]); }));
    const scN = scCells.length;
    const scatterWin = (BOOK.pay[Math.min(scN, 5)] || 0) * bet;
    let expand = null;
    if (fs && state && state.special) {
      const sp = BY[state.special];
      const reels = [];
      g.forEach((col, c) => { if (col.includes(sp.s)) reels.push(c); });
      const p = sp.pay[reels.length];
      if (p) expand = { s: sp.s, reels, n: reels.length, amount: p * lb * NLINES };
    }
    const total = lineWins.reduce((a, w) => a + w.amount, 0) + scatterWin + (expand ? expand.amount : 0);
    return { grid: g, lineWins, scN, scCells, scatterWin, expand, fsAward: scN >= 3 ? 10 : 0, total: Math.round(total) };
  }

  const BY = L.bySymbol([...SYMS, BOOK]);
  L.book = {
    REELS, ROWS, LINES, SYMS, BOOK, BY, FS: 10, spin,
    pickSpecial: (rng) => SYMS[Math.floor(rng() * SYMS.length)].s,
    randomSymbol: (rng) => pick(rng).s,
  };
})(typeof window !== 'undefined' ? window : globalThis);
