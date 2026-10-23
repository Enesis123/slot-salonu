// Şeker Fırtınası: 7x7, yan yana (dikey/yatay) 5+ aynı şeker küme olur ve patlar.
// Patlayan her kare işaretlenir; aynı kare yeniden patlarsa ×2, sonra her seferinde ikiye katlanır (en çok ×1024).
// Kümenin içindeki çarpanlar toplanıp kazançla çarpılır. Normal oyunda işaretler dönüş sonunda silinir,
// bedava dönüşte bonus boyunca kalır.
(function (root) {
  'use strict';
  const L = root.SlotLogic;
  const N = 7;
  const MAX_MULT = 1024;
  // Küme boyu 5,6,...,14,15+ için ödeme (toplam bahsin katı) = ROW × sembol katsayısı × SCALE
  const ROW = [0.2, 0.3, 0.4, 0.5, 0.75, 1, 1.5, 2.5, 4, 7, 15];
  const SYMS = [
    { s: 'dango',   e: '🍡', name: 'Dango',   k: 5,   w: 10 },
    { s: 'donut',   e: '🍩', name: 'Donut',   k: 3,   w: 11 },
    { s: 'cake',    e: '🧁', name: 'Kek',     k: 2,   w: 12 },
    { s: 'lolly',   e: '🍭', name: 'Lolipop', k: 1.5, w: 13 },
    { s: 'candy',   e: '🍬', name: 'Şeker',   k: 1,   w: 14 },
    { s: 'cookie',  e: '🍪', name: 'Kurabiye', k: 0.8, w: 15 },
    { s: 'pudding', e: '🍮', name: 'Puding',  k: 0.6, w: 16 },
  ];
  const SC = { s: 'sc', e: '🌟', name: 'Yıldız' };
  const W = { sc: 0.55, scFs: 0.5 };
  const SCALE = 5.15;
  const FS_TABLE = { 3: 10, 4: 12, 5: 15, 6: 20, 7: 30 };
  SYMS.forEach((x) => { x.pay = ROW.map((p) => p * x.k * SCALE); });

  const basePick = L.picker([...SYMS, { ...SC, w: W.sc }]);
  // Bedava dönüşte ucuz şekerler daha sık: daha çok küme, çarpanlı kareler daha hızlı büyür
  const FS_BOOST = [1, 1, 1, 1.22, 1.6, 1.95, 2.3];
  const fsPick = L.picker([...SYMS.map((x, i) => ({ ...x, w: x.w * FS_BOOST[i] })), { ...SC, w: W.scFs }]);
  const make = (rng, pick) => ({ id: L.uid(), s: pick(rng).s });
  const payFor = (sym, n) => sym.pay[Math.min(n, 15) - 5];
  const BY = L.bySymbol([...SYMS, SC]);

  // Dikey/yatay komşulukla kümeler; boyu 5+ olanlar
  function clusters(g) {
    const seen = new Uint8Array(N * N);
    const out = [];
    for (let c = 0; c < N; c++) for (let r = 0; r < N; r++) {
      const s = g[c][r].s;
      if (s === 'sc' || seen[c * N + r]) continue;
      const stack = [[c, r]], cells = [];
      seen[c * N + r] = 1;
      while (stack.length) {
        const [x, y] = stack.pop();
        cells.push([x, y]);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= N || ny >= N || seen[nx * N + ny] || g[nx][ny].s !== s) continue;
          seen[nx * N + ny] = 1;
          stack.push([nx, ny]);
        }
      }
      if (cells.length >= 5) out.push({ s, cells });
    }
    return out;
  }

  const emptySpots = () => Array.from({ length: N }, () => new Array(N).fill(0));
  const copySpots = (sp) => sp.map((col) => col.slice());

  // Şans katsayısı: satın alınan bonus işaretli/çarpanlı karelerle başlar
  function seedSpots(rng, luck) {
    const sp = emptySpots();
    const n = Math.round((luck - 1) * 2.5);
    for (let i = 0; i < n; i++) {
      const c = Math.floor(rng() * N), r = Math.floor(rng() * N);
      sp[c][r] = sp[c][r] ? Math.min(sp[c][r] * 2, MAX_MULT) : 2;
    }
    return sp;
  }

  function spin(bet, rng, fs, state) {
    const pick = fs ? fsPick : basePick;
    let spots;
    if (fs) {
      if (!state.spots) state.spots = seedSpots(rng, state.luck || 1);
      spots = state.spots;
    } else spots = emptySpots();

    let g = [];
    for (let c = 0; c < N; c++) {
      const col = [];
      for (let r = 0; r < N; r++) col.push(make(rng, pick));
      g.push(col);
    }
    const steps = [];
    let total = 0;
    for (;;) {
      const found = clusters(g);
      const before = copySpots(spots);
      const wins = found.map(({ s, cells }) => {
        let mult = 0;
        for (const [c, r] of cells) if (spots[c][r] >= 2) mult += spots[c][r];
        const base = payFor(BY[s], cells.length) * bet;
        return { s, n: cells.length, cells, ids: cells.map(([c, r]) => g[c][r].id), mult, base, amount: base * (mult || 1) };
      });
      const win = wins.reduce((a, w) => a + w.amount, 0);
      if (!wins.length) { steps.push({ grid: g, wins, win, spots: before, spotsAfter: before }); break; }
      total += win;
      const dead = new Set();
      for (const w of wins) for (const [c, r] of w.cells) {
        dead.add(g[c][r].id);
        spots[c][r] = spots[c][r] === 0 ? 1 : Math.min(Math.max(2, spots[c][r] * 2), MAX_MULT);
      }
      steps.push({ grid: g, wins, win, spots: before, spotsAfter: copySpots(spots) });
      g = g.map((col) => {
        const keep = col.filter((x) => !dead.has(x.id));
        const add = [];
        for (let i = keep.length; i < N; i++) add.push(make(rng, pick));
        return add.concat(keep);
      });
    }
    let scN = 0;
    const scIds = [];
    for (const col of g) for (const cell of col) if (cell.s === 'sc') { scN++; scIds.push(cell.id); }
    const fsAward = FS_TABLE[Math.min(scN, 7)] || 0;
    return { steps, scN, scIds, scatterWin: 0, fsAward, total: Math.round(total) };
  }

  L.rush = {
    N, COLS: N, ROWS: N, SYMS, SC, BY, MAX_MULT, FS: 10, FS_TABLE, spin,
    randomGrid(rng) {
      const g = [];
      for (let c = 0; c < N; c++) { const col = []; for (let r = 0; r < N; r++) col.push(make(rng, basePick)); g.push(col); }
      return g;
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
