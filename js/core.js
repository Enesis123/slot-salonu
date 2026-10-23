// Cüzdan, jackpot, istatistik, ses ve ortak arayüz parçaları
(function () {
  'use strict';
  const KEY = 'slotSalonu.v1';
  const START_BALANCE = 10000;
  const DAILY_BONUS = 5000;
  const JACKPOT_SEED = 50000;

  const today = () => new Date().toISOString().slice(0, 10);

  const defaults = () => ({
    balance: START_BALANCE, lastDaily: null, jackpot: JACKPOT_SEED,
    sound: true, turbo: false, bets: {},
    stats: { spins: 0, wagered: 0, won: 0, biggest: 0, biggestGame: '', jackpots: 0 },
  });

  let data;
  try { data = Object.assign(defaults(), JSON.parse(localStorage.getItem(KEY) || '{}')); }
  catch (e) { data = defaults(); }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* gizli pencere: kayıt yok */ }
  }

  const listeners = [];
  const emit = () => { save(); listeners.forEach((fn) => fn()); };

  const Store = {
    data, save,
    onChange: (fn) => listeners.push(fn),
    canBet: (n) => data.balance >= n,
    sub(n) { data.balance -= n; emit(); },
    add(n) { if (n) { data.balance += n; emit(); } },
    dailyReady: () => data.lastDaily !== today(),
    claimDaily() {
      if (!Store.dailyReady()) return 0;
      data.lastDaily = today();
      data.balance += DAILY_BONUS;
      emit();
      return DAILY_BONUS;
    },
    msToMidnight() {
      const d = new Date(); d.setHours(24, 0, 0, 0);
      return d - new Date();
    },
    recordBet(n) { data.stats.spins++; data.stats.wagered += n; emit(); },
    recordWin(n, game) {
      data.stats.won += n;
      if (n > data.stats.biggest) { data.stats.biggest = n; data.stats.biggestGame = game; }
      emit();
    },
    resetAll() { const keep = { sound: data.sound, turbo: data.turbo }; Object.assign(data, defaults(), keep); emit(); },
  };

  // Ortak jackpot: her bahsin %1.5'i havuza girer, şans bahisle orantılı
  const Jackpot = {
    get value() { return Math.floor(data.jackpot); },
    contribute(bet) { data.jackpot += bet * 0.015; emit(); },
    roll: (bet) => Math.random() < bet / 3000000,
    take() { const v = Math.floor(data.jackpot); data.jackpot = JACKPOT_SEED; data.stats.jackpots++; emit(); return v; },
  };

  // Sentezlenmiş sesler — dosya yok, WebAudio ile anlık üretiliyor
  let ctx = null;
  function ac() {
    if (!ctx) { try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; } }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  function tone(freq, dur, { type = 'sine', vol = 0.15, at = 0, slide = 0 } = {}) {
    const a = ac(); if (!a) return;
    const t = a.currentTime + at;
    const o = a.createOscillator(), g = a.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(a.destination);
    o.start(t); o.stop(t + dur + 0.02);
  }
  const SOUNDS = {
    click: () => tone(600, 0.05, { type: 'square', vol: 0.05 }),
    spin: () => tone(220, 0.25, { type: 'sawtooth', vol: 0.05, slide: 2 }),
    stop: () => tone(140, 0.08, { type: 'triangle', vol: 0.18 }),
    win: () => [523, 659, 784].forEach((f, i) => tone(f, 0.18, { type: 'triangle', at: i * 0.07 })),
    pop: () => tone(900, 0.12, { type: 'sine', vol: 0.12, slide: 0.4 }),
    drop: () => tone(300, 0.06, { type: 'triangle', vol: 0.06 }),
    scatter: () => [784, 988, 1175].forEach((f, i) => tone(f, 0.25, { type: 'sine', vol: 0.12, at: i * 0.1 })),
    tease: () => tone(440, 0.6, { type: 'sawtooth', vol: 0.04, slide: 1.5 }),
    big: () => [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => tone(f, 0.3, { type: 'square', vol: 0.06, at: i * 0.12 })),
    lose: () => tone(200, 0.3, { type: 'sawtooth', vol: 0.06, slide: 0.5 }),
    coin: () => tone(1500 + Math.random() * 500, 0.08, { type: 'sine', vol: 0.06 }),
  };
  const Sound = {
    play(name) { if (data.sound && SOUNDS[name]) try { SOUNDS[name](); } catch (e) { /* ses kapalı cihaz */ } },
  };

  const fmt = (n) => Math.floor(n).toLocaleString('tr-TR');
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const el = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };

  function toast(msg, ms = 2200) {
    const t = el(`<div class="toast">${msg}</div>`);
    document.body.appendChild(t);
    requestAnimationFrame(() => t.classList.add('show'));
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, ms);
  }

  // Basit modal: buttons [{label, value, cls}] → seçilen değerle çözülür
  function modal({ title = '', html = '', buttons = [{ label: 'Tamam', value: true }], cls = '', dismiss = true }) {
    return new Promise((resolve) => {
      const m = el(`<div class="modal-back ${cls}"><div class="modal">
        ${title ? `<h3>${title}</h3>` : ''}<div class="modal-body">${html}</div>
        <div class="modal-btns"></div></div></div>`);
      const box = m.querySelector('.modal-btns');
      const close = (v) => { m.classList.remove('show'); setTimeout(() => m.remove(), 200); resolve(v); };
      buttons.forEach((b) => {
        const btn = el(`<button class="btn ${b.cls || ''}">${b.label}</button>`);
        btn.onclick = () => { Sound.play('click'); close(b.value); };
        box.appendChild(btn);
      });
      if (dismiss) m.addEventListener('click', (e) => { if (e.target === m) close(null); });
      document.body.appendChild(m);
      requestAnimationFrame(() => m.classList.add('show'));
      m.api = { close, el: m };
      if (modal.onOpen) modal.onOpen(m);
    });
  }

  function countUp(node, to, ms) {
    return new Promise((resolve) => {
      const start = performance.now();
      const step = (now) => {
        const k = Math.min(1, (now - start) / ms);
        node.textContent = fmt(to * (1 - Math.pow(1 - k, 3)));
        if (k < 1) requestAnimationFrame(step); else resolve();
      };
      requestAnimationFrame(step);
    });
  }

  function coinRain(n = 40) {
    const box = el('<div class="coin-rain"></div>');
    for (let i = 0; i < n; i++) {
      const c = el('<span>🪙</span>');
      c.style.left = Math.random() * 100 + '%';
      c.style.animationDelay = Math.random() * 1.2 + 's';
      c.style.animationDuration = 1.4 + Math.random() * 1.2 + 's';
      c.style.fontSize = 18 + Math.random() * 22 + 'px';
      box.appendChild(c);
    }
    document.body.appendChild(box);
    setTimeout(() => box.remove(), 4000);
  }

  // Büyük kazanç kutlaması: dokununca ya da birkaç saniye sonra kapanır
  function celebrate(title, amount, sub = '') {
    return new Promise((resolve) => {
      const o = el(`<div class="celebrate"><div class="cel-inner">
        <div class="cel-title">${title}</div><div class="cel-amount">0</div>
        ${sub ? `<div class="cel-sub">${sub}</div>` : ''}<div class="cel-hint">devam için dokun</div></div></div>`);
      document.body.appendChild(o);
      requestAnimationFrame(() => o.classList.add('show'));
      Sound.play('big');
      coinRain();
      const coinTimer = setInterval(() => Sound.play('coin'), 120);
      let done = false;
      const finish = () => {
        if (done) return; done = true;
        clearInterval(coinTimer);
        o.classList.remove('show');
        setTimeout(() => { o.remove(); resolve(); }, 250);
      };
      countUp(o.querySelector('.cel-amount'), amount, 1800).then(() => {
        clearInterval(coinTimer);
        setTimeout(finish, data.turbo ? 900 : 1800);
      });
      o.addEventListener('click', () => {
        o.querySelector('.cel-amount').textContent = fmt(amount);
        finish();
      });
    });
  }

  function winTier(win, bet) {
    const x = win / bet;
    if (x >= 100) return 'EFSANE KAZANÇ';
    if (x >= 50) return 'MEGA KAZANÇ';
    if (x >= 15) return 'BÜYÜK KAZANÇ';
    return null;
  }

  window.Core = { Store, Jackpot, Sound, fmt, sleep, el, toast, modal, countUp, coinRain, celebrate, winTier, DAILY_BONUS };
})();
