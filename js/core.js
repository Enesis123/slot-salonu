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
    sfxVol: 0.8, musicVol: 0.5, turbo: false, bets: {},
    stats: { spins: 0, wagered: 0, won: 0, biggest: 0, biggestGame: '', jackpots: 0 },
  });

  let data;
  try { data = Object.assign(defaults(), JSON.parse(localStorage.getItem(KEY) || '{}')); }
  catch (e) { data = defaults(); }

  // Eski sürümdeki aç/kapa ses ayarını yeni ses seviyelerine çevir
  if (data.sound === false) { data.sfxVol = 0; data.musicVol = 0; }
  delete data.sound;

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* gizli pencere: kayıt yok */ }
  }

  const listeners = [];
  const emit = () => { save(); listeners.forEach((fn) => fn()); };

  // Oyun başka sekmede de açıksa onun yazdıklarını al, yoksa sekmeler birbirinin bakiyesini ezer
  window.addEventListener('storage', (e) => {
    if (e.key !== KEY || !e.newValue) return;
    try { Object.assign(data, JSON.parse(e.newValue)); } catch (err) { return; }
    listeners.forEach((fn) => fn());
  });

  const Store = {
    data, save,
    onChange: (fn) => listeners.push(fn),
    canBet: (n) => data.balance >= n,
    sub(n) { data.balance -= n; emit(); },
    add(n) { if (n) { data.balance += n; emit(); } },
    setBalance(n) { data.balance = Math.max(0, Math.floor(n)); emit(); },
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
    resetAll() { const keep = { sfxVol: data.sfxVol, musicVol: data.musicVol, turbo: data.turbo }; Object.assign(data, defaults(), keep); emit(); },
  };

  // Ortak jackpot: her bahsin %1.5'i havuza girer, şans bahisle orantılı
  const Jackpot = {
    get value() { return Math.floor(data.jackpot); },
    contribute(bet) { data.jackpot += bet * 0.015; emit(); },
    roll: (bet) => Math.random() < bet / 3000000,
    take() { const v = Math.floor(data.jackpot); data.jackpot = JACKPOT_SEED; data.stats.jackpots++; emit(); return v; },
  };

  // Sentezlenmiş sesler — dosya yok, WebAudio ile anlık üretiliyor.
  // Hepsi ortak bir çıkışa (sıkıştırıcı) ve yankı odasına gider; böylece daha dolgun duyulur.
  // İki kanal: efekt ve müzik; ikisinin de kendi ses seviyesi ve yankı odası var
  let ctx = null, noiseBuf = null;
  const bus = {};
  function ac() {
    if (!ctx) {
      try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; }
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14; comp.ratio.value = 4;
      comp.connect(ctx.destination);
      // Yapay yankı: sönümlenen gürültüden üretilmiş oda tepkisi
      const len = ctx.sampleRate * 1.8;
      const ir = ctx.createBuffer(2, len, ctx.sampleRate);
      for (let ch = 0; ch < 2; ch++) {
        const d = ir.getChannelData(ch);
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
      }
      for (const name of ['sfx', 'music']) {
        const out = ctx.createGain();
        out.connect(comp);
        const rev = ctx.createConvolver(); rev.buffer = ir;
        const wet = ctx.createGain(); wet.gain.value = name === 'music' ? 0.35 : 0.28;
        wet.connect(rev).connect(out);
        bus[name] = { out, wet };
      }
      applyVolumes();
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const nd = noiseBuf.getChannelData(0);
      for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function applyVolumes() {
    if (!ctx) return;
    bus.sfx.out.gain.setTargetAtTime(data.sfxVol, ctx.currentTime, 0.05);
    bus.music.out.gain.setTargetAtTime(data.musicVol * 0.7, ctx.currentTime, 0.05);
  }

  function route(node, send, which = 'sfx') {
    const b = bus[which];
    node.connect(b.out);
    if (send) { const s = ctx.createGain(); s.gain.value = send; node.connect(s).connect(b.wet); }
  }

  // Tek nota: yumuşak atak, üstel sönüm, istenirse kayma/filtre/yankı
  function tone(freq, dur, { type = 'sine', vol = 0.15, at = 0, slide = 0, attack = 0.005, send = 0.25, cutoff = 0, detune = 0, to = 'sfx', vibrato = 0 } = {}) {
    const a = ac(); if (!a) return;
    const t = a.currentTime + at;
    const o = a.createOscillator(), g = a.createGain();
    o.type = type;
    o.detune.value = detune;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
    if (vibrato) {
      const lfo = a.createOscillator(), lg = a.createGain();
      lfo.frequency.value = 5.5; lg.gain.value = freq * vibrato;
      lfo.connect(lg).connect(o.frequency);
      lfo.start(t); lfo.stop(t + dur + 0.05);
    }
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let last = o;
    if (cutoff) {
      const f = a.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = cutoff;
      o.connect(f); last = f;
    }
    last.connect(g);
    route(g, send, to);
    o.start(t); o.stop(t + dur + 0.05);
  }

  // Filtrelenmiş gürültü: hışırtı, vuuş, çıtırtı
  function noise(dur, { at = 0, vol = 0.1, type = 'bandpass', from = 1000, to = 0, q = 1, send = 0.2, bus: which = 'sfx' } = {}) {
    const a = ac(); if (!a) return;
    const t = a.currentTime + at;
    const s = a.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
    const f = a.createBiquadFilter(); f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(from, t);
    if (to) f.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = a.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.03, dur / 3));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g);
    route(g, send, which);
    s.start(t); s.stop(t + dur + 0.05);
  }

  // Çan/jeton: uyumsuz kısmi tonlarla metalik tını
  function bell(freq, { at = 0, vol = 0.08, dur = 0.6 } = {}) {
    [[1, 1], [2.76, 0.5], [5.4, 0.25], [8.9, 0.12]].forEach(([k, v]) =>
      tone(freq * k, dur / Math.sqrt(k), { at, vol: vol * v, send: 0.35 }));
  }

  const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];
  const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);
  let winRoot = 0;

  const SOUNDS = {
    click: () => tone(1400, 0.04, { type: 'triangle', vol: 0.05, send: 0 }),
    spin: () => {
      noise(0.4, { vol: 0.09, from: 300, to: 2600, q: 0.8 });
      tone(110, 0.35, { type: 'sine', vol: 0.12, slide: 2, send: 0 });
    },
    stop: () => {
      tone(130, 0.14, { type: 'sine', vol: 0.32, slide: 0.5, send: 0.05 });
      noise(0.04, { vol: 0.08, type: 'highpass', from: 3000, send: 0 });
    },
    win: () => {
      // Her kazançta biraz farklı, yükselen pentatonik arpej
      winRoot = (winRoot + 2) % 7;
      const base = 72 + winRoot;
      [0, 2, 4, 5].forEach((step, i) => {
        const f = midi(base + PENTA[step]);
        tone(f, 0.35, { type: 'triangle', vol: 0.1, at: i * 0.06, send: 0.35 });
        tone(f * 2, 0.25, { type: 'sine', vol: 0.03, at: i * 0.06 });
      });
    },
    pop: () => {
      tone(280, 0.11, { type: 'sine', vol: 0.2, slide: 4.5, send: 0.2 });
      noise(0.05, { vol: 0.05, type: 'highpass', from: 4000, send: 0 });
    },
    drop: () => tone(520, 0.06, { type: 'sine', vol: 0.06, slide: 0.6, send: 0 }),
    scatter: () => {
      for (let i = 0; i < 8; i++) bell(midi(84 + PENTA[i % PENTA.length]), { at: i * 0.055, vol: 0.06, dur: 0.7 });
      noise(0.8, { vol: 0.03, type: 'highpass', from: 6000, send: 0.5 });
    },
    tease: () => {
      noise(1.0, { vol: 0.07, from: 400, to: 5000, q: 2 });
      tone(220, 1.0, { type: 'sawtooth', vol: 0.03, slide: 2, cutoff: 1800 });
    },
    big: () => {
      // Pirinç tınılı akorlarla zafer marşı: I - IV - V - I
      const chords = [[60, 64, 67], [65, 69, 72], [67, 71, 74], [72, 76, 79, 84]];
      chords.forEach((ch, i) => {
        const at = i * 0.28;
        const dur = i === 3 ? 1.4 : 0.32;
        ch.forEach((n) => {
          tone(midi(n), dur, { type: 'sawtooth', vol: 0.045, at, attack: 0.02, cutoff: 2400, detune: -6, send: 0.4 });
          tone(midi(n), dur, { type: 'sawtooth', vol: 0.045, at, attack: 0.02, cutoff: 2400, detune: 6 });
        });
        tone(midi(ch[0] - 24), dur, { type: 'sine', vol: 0.25, at, send: 0 });
      });
      for (let i = 0; i < 6; i++) bell(midi(96 + PENTA[i]), { at: 0.85 + i * 0.07, vol: 0.04 });
    },
    lose: () => {
      tone(midi(62), 0.22, { type: 'triangle', vol: 0.1, slide: 0.94 });
      tone(midi(58), 0.45, { type: 'triangle', vol: 0.1, at: 0.22, slide: 0.9 });
    },
    coin: () => bell(1700 + Math.random() * 900, { vol: 0.05, dur: 0.35 }),
    throw: () => {
      noise(0.3, { vol: 0.1, from: 600, to: 4000, q: 1.5 });
      tone(400, 0.3, { type: 'sawtooth', vol: 0.03, slide: 3, cutoff: 3000 });
    },
    zap: () => {
      tone(2200, 0.18, { type: 'square', vol: 0.04, slide: 0.2, cutoff: 5000 });
      noise(0.15, { vol: 0.12, type: 'highpass', from: 2500, send: 0.3 });
      tone(70, 0.25, { type: 'sine', vol: 0.3, slide: 0.6, send: 0 });
    },
    spot: () => tone(midi(88 + PENTA[Math.floor(Math.random() * 5)]), 0.25, { type: 'sine', vol: 0.05, send: 0.5 }),
  };
  // ——— Müzik: kodla üretilen döngüler (dosya yok, telif yok) ———
  // Her tema: tempo, 4 ölçülük akor dizisi, melodi gamı ve davul deseni. 16'lık adımlarla önden planlanır.
  const M = (n, t, dur, o = {}) => tone(midi(n), dur, { to: 'music', at: Math.max(0, t - ctx.currentTime), ...o });
  const MN = (t, dur, o = {}) => noise(dur, { bus: 'music', at: Math.max(0, t - ctx.currentTime), send: 0.1, ...o });
  const INST = {
    pad: (n, t, d) => { M(n, t, d, { type: 'sawtooth', vol: 0.018, attack: 0.5, cutoff: 900, detune: -7, send: 0.5 }); M(n, t, d, { type: 'sawtooth', vol: 0.018, attack: 0.5, cutoff: 900, detune: 7 }); },
    softPad: (n, t, d) => M(n, t, d, { type: 'triangle', vol: 0.035, attack: 0.6, send: 0.6 }),
    pluck: (n, t) => { M(n, t, 0.35, { type: 'triangle', vol: 0.055, send: 0.35 }); M(n + 12, t, 0.18, { type: 'sine', vol: 0.02 }); },
    bell: (n, t) => [[1, 1], [2.76, 0.4], [5.4, 0.15]].forEach(([k, v]) => tone(midi(n) * k, 0.9 / k, { to: 'music', at: Math.max(0, t - ctx.currentTime), vol: 0.035 * v, send: 0.5 })),
    flute: (n, t) => M(n, t, 0.5, { type: 'sine', vol: 0.06, attack: 0.06, vibrato: 0.006, send: 0.45 }),
    oud: (n, t) => M(n, t, 0.3, { type: 'sawtooth', vol: 0.04, cutoff: 1600, send: 0.3 }),
    chip: (n, t) => M(n, t, 0.12, { type: 'square', vol: 0.025, send: 0.1 }),
    bass: (n, t, d) => { M(n, t, d, { type: 'sine', vol: 0.16, send: 0 }); M(n, t, d * 0.6, { type: 'triangle', vol: 0.05, send: 0 }); },
    kick: (t) => M(36, t, 0.22, { type: 'sine', vol: 0.3, slide: 0.45, send: 0 }),
    snare: (t) => { MN(t, 0.13, { vol: 0.06, from: 1800, q: 0.7 }); M(50, t, 0.08, { type: 'triangle', vol: 0.05, send: 0 }); },
    hat: (t, v = 0.022) => MN(t, 0.04, { vol: v, type: 'highpass', from: 7500, send: 0 }),
    shaker: (t) => MN(t, 0.06, { vol: 0.014, type: 'highpass', from: 5000, send: 0 }),
    tom: (t, n) => M(n, t, 0.3, { type: 'sine', vol: 0.2, slide: 0.6, send: 0.15 }),
  };
  const C4 = [[60, 64, 67, 71], [57, 60, 64, 67], [53, 57, 60, 64], [55, 59, 62, 65]];
  const THEMES = {
    lobby: { bpm: 84, chords: C4, scale: [72, 74, 76, 79, 81, 84], pad: 'softPad', arp: 'pluck', arpEvery: 4, mel: 'bell', melP: 0.3,
      drums(s, t, hot) { if (s === 0 || s === 10) INST.kick(t); if (s % 4 === 2) INST.hat(t, 0.015); if (hot && s % 2) INST.hat(t, 0.01); } },
    candy: { bpm: 116, chords: [[65, 69, 72], [60, 64, 67], [62, 65, 69], [58, 62, 65]], scale: [77, 79, 81, 84, 86, 89], pad: 'softPad', arp: 'pluck', arpEvery: 2, mel: 'bell', melP: 0.45,
      drums(s, t, hot) { if (s % 4 === 0) INST.kick(t); if (s === 4 || s === 12) INST.snare(t); if (s % 2 === 0) INST.hat(t); if (hot && s % 2) INST.hat(t, 0.012); } },
    dede: { bpm: 76, chords: [[62, 65, 69], [58, 62, 65], [60, 64, 67], [57, 61, 64]], scale: [74, 76, 77, 79, 81, 83, 86], pad: 'pad', arp: 'bell', arpEvery: 4, mel: 'bell', melP: 0.25,
      drums(s, t, hot) { if (s === 0) INST.tom(t, 38); if (s === 8 && hot) INST.tom(t, 41); if (s % 4 === 2) INST.shaker(t); if (hot && s % 2 === 0) INST.hat(t, 0.012); } },
    amazon: { bpm: 100, chords: [[57, 60, 64], [55, 59, 62], [53, 57, 60], [55, 59, 62]], scale: [69, 72, 74, 76, 79, 81], pad: 'softPad', arp: null, mel: 'flute', melP: 0.5,
      drums(s, t, hot) {
        const toms = { 0: 41, 3: 45, 6: 41, 8: 38, 10: 45, 13: 48 };
        if (toms[s]) INST.tom(t, toms[s]);
        INST.shaker(t);
        if (hot && (s === 4 || s === 12)) INST.snare(t);
      } },
    mine: { bpm: 108, chords: [[57, 60, 64], [55, 59, 62], [53, 57, 60], [52, 56, 59]], scale: [69, 71, 72, 74, 76, 77, 80, 81], pad: 'pad', arp: 'pluck', arpEvery: 2, mel: 'pluck', melP: 0.35,
      drums(s, t, hot) { if (s === 0 || s === 8 || (hot && s % 4 === 0)) INST.kick(t); if (s === 4 || s === 12) INST.snare(t); if (s % 2 === 0) INST.hat(t); } },
    book: { bpm: 88, chords: [[52, 56, 59], [53, 57, 60], [52, 56, 59], [50, 53, 57]], scale: [64, 65, 68, 69, 71, 72, 74, 76], pad: 'softPad', arp: null, mel: 'oud', melP: 0.55,
      drums(s, t, hot) { if (s === 0 || s === 6) INST.tom(t, 43); if (s === 4 || s === 12) MN(t, 0.08, { vol: 0.05, from: 2500, q: 2 }); if (s === 10) INST.tom(t, 48); if (hot && s % 2) INST.shaker(t); } },
    classic: { bpm: 128, chords: [[60, 64, 67], [57, 60, 64], [53, 57, 60], [55, 59, 62]], scale: [72, 74, 76, 79, 81, 84], pad: null, arp: 'chip', arpEvery: 1, mel: 'chip', melP: 0.4,
      drums(s, t, hot) { if (s % 4 === 0) INST.kick(t); if (s % 2 === 1) INST.hat(t, 0.015); if (hot && (s === 4 || s === 12)) INST.snare(t); } },
  };
  const GAME_THEME = { lobby: 'lobby', rush: 'candy', sweet: 'candy', dede: 'dede', amazon: 'amazon', mine: 'mine', book: 'book', classic: 'classic' };

  const Music = (() => {
    let theme = null, timer = null, step = 0, nextT = 0, hot = false, melIdx = 2;
    function playStep(s16, t, spb) {
      const bar = Math.floor(step / 16) % theme.chords.length;
      const ch = theme.chords[bar];
      if (s16 === 0 && theme.pad) ch.forEach((n) => INST[theme.pad](n, t, spb * 16));
      if (s16 === 0 || s16 === 8 || (hot && s16 % 4 === 0)) INST.bass(ch[0] - 24, t, spb * (hot ? 3.5 : 7));
      if (theme.arp && s16 % theme.arpEvery === 0) {
        const i = (s16 / theme.arpEvery) % (ch.length + 1);
        INST[theme.arp](i < ch.length ? ch[i] + 12 : ch[0] + 24, t);
      }
      if (s16 % 2 === 0 && Math.random() < theme.melP * (hot ? 1.3 : 1)) {
        melIdx = Math.max(0, Math.min(theme.scale.length - 1, melIdx + Math.floor(Math.random() * 5) - 2));
        INST[theme.mel](theme.scale[melIdx], t);
      }
      theme.drums(s16, t, hot);
    }
    function tick() {
      if (!theme || !ctx) return;
      const spb = 60 / (theme.bpm * (hot ? 1.12 : 1)) / 4;
      if (data.musicVol <= 0 || ctx.state !== 'running') { nextT = ctx.currentTime + 0.05; return; }
      if (nextT < ctx.currentTime) nextT = ctx.currentTime + 0.05;
      while (nextT < ctx.currentTime + 0.15) {
        try { playStep(step % 16, nextT, spb); } catch (e) { /* ses yok */ }
        nextT += spb;
        step++;
      }
    }
    return {
      play(id) {
        const next = THEMES[GAME_THEME[id] || 'lobby'];
        if (!ac()) return;
        if (theme === next) return;
        theme = next; step = 0; hot = false; melIdx = 2;
        nextT = ctx.currentTime + 0.1;
        if (!timer) timer = setInterval(tick, 30);
      },
      setHot(v) { hot = v; },
    };
  })();

  // Tarayıcılar sesi ilk dokunuştan önce açtırmıyor; ilk dokunuşta başlat, sekme gizlenince sustur
  document.addEventListener('pointerdown', () => ac(), { once: true });
  document.addEventListener('keydown', () => ac(), { once: true });
  document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    if (document.hidden) ctx.suspend(); else ctx.resume();
  });

  const Sound = {
    play(name) { if (data.sfxVol > 0 && SOUNDS[name]) try { SOUNDS[name](); } catch (e) { /* ses kapalı cihaz */ } },
    setVolume(kind, v) {
      data[kind === 'music' ? 'musicVol' : 'sfxVol'] = v;
      save();
      applyVolumes();
    },
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
  function modal({ title = '', html = '', buttons = [{ label: 'Tamam', value: true }], cls = '', dismiss = true, onOpen = null }) {
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
      if (onOpen) onOpen(m, close);
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

  window.Core = { Store, Jackpot, Sound, Music, fmt, sleep, el, toast, modal, countUp, coinRain, celebrate, winTier, DAILY_BONUS };
})();
