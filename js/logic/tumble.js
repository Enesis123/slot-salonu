// Şeker Patlaması: 6x5 alan, aynı sembolden 8+ olunca patlar, yenileri düşer.
// Bedava dönüşlerde çarpan bombaları gelir, düşüşler bitince toplanıp kazançla çarpılır.
(function (root) {
  'use strict';
  const L = root.SlotLogic;
  const COLS = 6, ROWS = 5;

  // pay: [8-9 adet, 10-11 adet, 12+ adet] — toplam bahsin katı
  const SYMS = [
    { s: 'lolly',  e: '🍭', name: 'Lolipop',  pay: [30, 75, 150],   w: 5 },
    { s: 'candy',  e: '🍬', name: 'Şeker',    pay: [7.5, 30, 75],   w: 7 },
    { s: 'cake',   e: '🧁', name: 'Kek',      pay: [6, 15, 45],     w: 8 },
    { s: 'choco',  e: '🍫', name: 'Çikolata', pay: [4.5, 6, 36],    w: 9 },
    { s: 'melon',  e: '🍉', name: 'Karpuz',   pay: [3, 4.5, 30],    w: 11 },
    { s: 'grape',  e: '🍇', name: 'Üzüm',     pay: [2.4, 3.6, 24],  w: 12 },
    { s: 'apple',  e: '🍎', name: 'Elma',     pay: [1.5, 3, 15],    w: 13 },
    { s: 'banana', e: '🍌', name: 'Muz',      pay: [1.2, 2.7, 12],  w: 14 },
    { s: 'cherry', e: '🍒', name: 'Kiraz',    pay: [0.75, 2.25, 6], w: 15 },
  ];
  const SC = { s: 'sc', e: '🌈', name: 'Gökkuşağı' };
  const BOMB = { s: 'bomb', e: '💣', name: 'Çarpan Bombası' };
  const W = { sc: 2.1, scFs: 1.6, bomb: 11.0 };
  const SC_PAY = { 4: 3, 5: 5, 6: 100 };
  const BOMB_VALUES = [
    [2, 30], [3, 25], [4, 20], [5, 15], [6, 10], [8, 8], [10, 6],
    [12, 4], [15, 3], [20, 2], [25, 1.5], [50, 0.6], [100, 0.25],
  ].map(([v, w]) => ({ v, w }));

  const basePick = L.picker([...SYMS, { ...SC, w: W.sc }]);
  const fsPick = L.picker([...SYMS, { ...SC, w: W.scFs }, { ...BOMB, w: W.bomb }]);
  const bombPick = L.picker(BOMB_VALUES);

  function make(rng, fs) {
    const sym = (fs ? fsPick : basePick)(rng);
    const cell = { id: L.uid(), s: sym.s };
    if (sym.s === 'bomb') cell.m = bombPick(rng).v;
    return cell;
  }

  function newGrid(rng, fs) {
    const g = [];
    for (let c = 0; c < COLS; c++) {
      const col = [];
      for (let r = 0; r < ROWS; r++) col.push(make(rng, fs));
      g.push(col);
    }
    return g;
  }

  function evaluate(g, bet) {
    const groups = {};
    for (const col of g) for (const cell of col) {
      if (cell.s === 'sc' || cell.s === 'bomb') continue;
      (groups[cell.s] = groups[cell.s] || []).push(cell.id);
    }
    const wins = [];
    for (const sym of SYMS) {
      const ids = groups[sym.s];
      if (!ids || ids.length < 8) continue;
      const n = ids.length;
      const tier = n >= 12 ? 2 : n >= 10 ? 1 : 0;
      wins.push({ s: sym.s, n, ids, amount: sym.pay[tier] * bet });
    }
    return wins;
  }

  function spin(bet, rng, fs) {
    let g = newGrid(rng, fs);
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
      // Kalanlar aşağı kayar, boşluklar üstten dolar
      g = g.map((col) => {
        const keep = col.filter((c) => !dead.has(c.id));
        const add = [];
        for (let i = keep.length; i < ROWS; i++) add.push(make(rng, fs));
        return add.concat(keep);
      });
    }
    let scN = 0, mult = 0;
    const scIds = [], bombIds = [];
    for (const col of g) for (const cell of col) {
      if (cell.s === 'sc') { scN++; scIds.push(cell.id); }
      if (cell.s === 'bomb') { mult += cell.m; bombIds.push(cell.id); }
    }
    const applied = fs && tumbleWin > 0 && mult > 0;
    const scatterWin = (SC_PAY[Math.min(scN, 6)] || 0) * bet;
    const fsAward = fs ? (scN >= 3 ? 5 : 0) : (scN >= 4 ? 10 : 0);
    return {
      steps, tumbleWin, mult: applied ? mult : 0, bombIds: applied ? bombIds : [],
      scN, scIds, scatterWin, fsAward,
      total: Math.round((applied ? tumbleWin * mult : tumbleWin) + scatterWin),
    };
  }

  L.tumble = {
    COLS, ROWS, SYMS, SC, BOMB, SC_PAY, BY: L.bySymbol([...SYMS, SC, BOMB]),
    FS: 10, BUY: 65, spin, randomGrid: (rng) => newGrid(rng, false),
  };
})(typeof window !== 'undefined' ? window : globalThis);
