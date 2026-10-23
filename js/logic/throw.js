// Fırlatmalı oyunlar (Dede, Amazon): 6x5, her yerden 8+ aynı sembol patlar.
// Karakterin fırlattığı çarpan küreleri düşüşler bitince toplanıp kazançla çarpılır.
// Bedava dönüşte küreler toplam çarpana eklenir ve dönüşler boyunca birikir.
(function (root) {
  'use strict';
  const L = root.SlotLogic;
  const COLS = 6, ROWS = 5;
  const PAYS = [[20, 50, 100], [5, 20, 50], [4, 10, 30], [3, 4, 24], [2, 3, 20], [1.6, 2.4, 16], [1, 2, 10], [0.8, 1.8, 8], [0.5, 1.5, 4]];
  const WEIGHTS = [5, 7, 8, 9, 11, 12, 13, 14, 15];
  const W = { sc: 2.1, scFs: 1.6, orb: 0.3, orbFs: 2.5 };
  const SC_PAY = { 4: 3, 5: 5, 6: 100 };
  const ORB_VALUES = [
    [2, 30], [3, 25], [4, 20], [5, 15], [6, 10], [8, 8], [10, 6], [12, 4], [15, 3],
    [20, 2], [25, 1.5], [50, 0.6], [100, 0.25], [250, 0.06], [500, 0.02],
  ].map(([v, w]) => ({ v, w }));
  const LUCK_K = { orb: 0.15 };
  const orbPickFor = L.cached((luck) => L.picker(L.luckyValues(ORB_VALUES, luck)));

  // theme: { syms: [{s, e, name}] (9 adet, pahalıdan ucuza), sc: {s,e,name}, orb: {name} }
  function create(theme) {
    const SYMS = theme.syms.map((x, i) => ({ ...x, pay: PAYS[i], w: WEIGHTS[i] }));
    const SC = { s: 'sc', ...theme.sc };
    const ORB = { s: 'orb', e: '', ...theme.orb };
    const basePick = L.picker([...SYMS, { ...SC, w: W.sc * L.SC_BOOST }, { ...ORB, w: W.orb }]);
    const fsPick = L.cached((luck) => L.picker([...SYMS, { ...SC, w: W.scFs * L.SC_BOOST }, { ...ORB, w: W.orbFs * (1 + (luck - 1) * LUCK_K.orb) }]));

    function make(rng, pick, luck = 1) {
      const sym = pick(rng);
      const cell = { id: L.uid(), s: sym.s };
      if (sym.s === 'orb') cell.m = orbPickFor(luck)(rng).v;
      return cell;
    }

    function newGrid(rng, pick, luck) {
      const g = [];
      for (let c = 0; c < COLS; c++) {
        const col = [];
        for (let r = 0; r < ROWS; r++) col.push(make(rng, pick, luck));
        g.push(col);
      }
      return g;
    }

    function evaluate(g, bet) {
      const groups = {};
      for (const col of g) for (const cell of col) {
        if (cell.s === 'sc' || cell.s === 'orb') continue;
        (groups[cell.s] = groups[cell.s] || []).push(cell.id);
      }
      const wins = [];
      for (const sym of SYMS) {
        const ids = groups[sym.s];
        if (!ids || ids.length < 8) continue;
        const n = ids.length;
        wins.push({ s: sym.s, n, ids, amount: sym.pay[n >= 12 ? 2 : n >= 10 ? 1 : 0] * bet * L.GEN });
      }
      return wins;
    }

    function spin(bet, rng, fs, state) {
      const luck = (fs && state && state.luck) || 1;
      const pick = fs ? fsPick(luck) : basePick;
      let g = newGrid(rng, pick, luck);
      const steps = [];
      let tumbleWin = 0;
      for (;;) {
        const wins = evaluate(g, bet);
        const win = wins.reduce((a, w) => a + w.amount, 0);
        steps.push({ grid: g, wins, win });
        if (!wins.length) break;
        tumbleWin += win;
        const dead = new Set();
        for (const w of wins) for (const id of w.ids) dead.add(id);
        g = g.map((col) => {
          const keep = col.filter((c) => !dead.has(c.id));
          const add = [];
          for (let i = keep.length; i < ROWS; i++) add.push(make(rng, pick, luck));
          return add.concat(keep);
        });
      }
      let scN = 0, orbSum = 0;
      const scIds = [], orbIds = [];
      for (const col of g) for (const cell of col) {
        if (cell.s === 'sc') { scN++; scIds.push(cell.id); }
        if (cell.s === 'orb') { orbSum += cell.m; orbIds.push(cell.id); }
      }
      // Küreler yalnız kazanç varsa işe yarar
      const applied = tumbleWin > 0 && orbSum > 0;
      let mult = 0;
      if (applied) {
        if (fs) { state.total = (state.total || 0) + orbSum; mult = state.total; } else mult = orbSum;
      }
      const scatterWin = (SC_PAY[Math.min(scN, 6)] || 0) * bet * L.GEN;
      const fsAward = fs ? (scN >= 3 ? 5 : 0) : (scN >= 4 ? 15 : 0);
      return {
        steps, tumbleWin, orbSum: applied ? orbSum : 0, orbIds: applied ? orbIds : [], mult,
        scN, scIds, scatterWin, fsAward,
        total: Math.round((applied ? tumbleWin * mult : tumbleWin) + scatterWin),
      };
    }

    return {
      COLS, ROWS, SYMS, SC, ORB, SC_PAY, BY: L.bySymbol([...SYMS, SC, ORB]),
      FS: 15, spin, randomGrid: (rng) => newGrid(rng, basePick),
    };
  }

  L.dede = create({
    syms: [
      { s: 'crown', e: '👑', name: 'Taç' }, { s: 'glass', e: '⏳', name: 'Kum saati' },
      { s: 'ring', e: '💍', name: 'Yüzük' }, { s: 'cup', e: '🏆', name: 'Kadeh' },
      { s: 'ball', e: '🔮', name: 'Küre' }, { s: 'scroll', e: '📜', name: 'Parşömen' },
      { s: 'candle', e: '🕯️', name: 'Mum' }, { s: 'key', e: '🗝️', name: 'Anahtar' },
      { s: 'coin', e: '🪙', name: 'Altın' },
    ],
    sc: { e: '⚡', name: 'Şimşek' },
    orb: { name: 'Şimşek Küresi' },
  });

  L.amazon = create({
    syms: [
      { s: 'jaguar', e: '🐆', name: 'Jaguar' }, { s: 'shield', e: '🛡️', name: 'Kalkan' },
      { s: 'bow', e: '🏹', name: 'Yay' }, { s: 'dagger', e: '🗡️', name: 'Hançer' },
      { s: 'parrot', e: '🦜', name: 'Papağan' }, { s: 'flower', e: '🌺', name: 'Çiçek' },
      { s: 'feather', e: '🪶', name: 'Tüy' }, { s: 'snake', e: '🐍', name: 'Yılan' },
      { s: 'leaf', e: '🍃', name: 'Yaprak' },
    ],
    sc: { e: '☀️', name: 'Güneş' },
    orb: { name: 'Ok Küresi' },
  });
})(typeof window !== 'undefined' ? window : globalThis);
