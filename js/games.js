// Oyun kabuğu (bahis, oto, bedava dönüş, bonus al, risk) + dört oyunun tanımı
(function () {
  'use strict';
  const { Store, Jackpot, Sound, fmt, sleep, el, toast, modal, celebrate, winTier } = window.Core;
  const { GridView, ReelView } = window.Views;
  const L = window.SlotLogic;
  const rng = Math.random;
  const BETS = [10, 20, 50, 100, 200, 500, 1000, 2000];
  const LINE_COLORS = ['#ffd84d', '#ff5d8f', '#4de1ff', '#7dff6a', '#c77dff', '#ff9a3c', '#3cffc2', '#ff4d4d', '#9db4ff', '#fff27a'];

  class GameShell {
    constructor(def, root) {
      this.def = def;
      this.root = root;
      const saved = BETS.indexOf(Store.data.bets[def.id]);
      this.betIdx = saved >= 0 ? saved : 3;
      this.busy = false;
      this.auto = 0;
      this.fs = null;
      this.lastWin = 0;
      this.build();
      def.mount(this.stage, this);
      this.updateBet();
      this.updateTurbo();
      this.setControls();
    }

    get bet() { return BETS[this.betIdx]; }
    get turbo() { return Store.data.turbo; }
    t(ms) { return this.turbo ? ms * 0.45 : ms; }

    build() {
      const d = this.def;
      this.root.innerHTML = `
      <section class="game theme-${d.id}">
        <div class="game-head">
          <h2><span>${d.icon}</span> ${d.title}</h2>
          <div class="badges"><span class="badge fs-badge" hidden></span><span class="badge extra-badge" hidden></span></div>
          <button class="icon-btn info-btn" title="Kurallar ve ödemeler">i</button>
        </div>
        <div class="machine"><div class="stage" style="--ar:${d.ar}"></div></div>
        <div class="msg"></div>
        <div class="controls">
          <div class="bet-box">
            <button class="round-btn bet-minus" aria-label="Bahsi azalt">−</button>
            <div class="readout"><small>BAHİS</small><b class="bet-val"></b></div>
            <button class="round-btn bet-plus" aria-label="Bahsi artır">+</button>
          </div>
          <div class="readout win-box"><small>KAZANÇ</small><b class="win-val">0</b></div>
          <button class="spin-btn" title="Çevir (boşluk tuşu)"><span class="spin-ico">↻</span><span class="spin-txt"></span></button>
          <div class="side-btns">
            <button class="pill auto-btn">OTO</button>
            <button class="pill turbo-btn">⚡ HIZLI</button>
            ${d.buy ? '<button class="pill buy-btn">BONUS AL</button>' : ''}
            ${d.gamble ? '<button class="pill gamble-btn">🃏 RİSK</button>' : ''}
          </div>
        </div>
      </section>`;
      const q = (s) => this.root.querySelector(s);
      this.gameEl = q('.game');
      this.stage = q('.stage');
      this.msgEl = q('.msg');
      this.winEl = q('.win-val');
      this.betEl = q('.bet-val');
      this.fsBadge = q('.fs-badge');
      this.extraBadge = q('.extra-badge');
      this.spinBtn = q('.spin-btn');
      this.autoBtn = q('.auto-btn');
      this.turboBtn = q('.turbo-btn');
      this.buyBtn = q('.buy-btn');
      this.gambleBtn = q('.gamble-btn');
      this.betBtns = [q('.bet-minus'), q('.bet-plus')];

      this.spinBtn.onclick = () => { if (this.auto) this.stopAuto(); else this.round(); };
      this.betBtns[0].onclick = () => this.changeBet(-1);
      this.betBtns[1].onclick = () => this.changeBet(1);
      this.autoBtn.onclick = () => (this.auto ? this.stopAuto() : this.chooseAuto());
      this.turboBtn.onclick = () => { Store.data.turbo = !Store.data.turbo; Store.save(); this.updateTurbo(); Sound.play('click'); };
      if (this.buyBtn) this.buyBtn.onclick = () => this.buyBonus();
      if (this.gambleBtn) this.gambleBtn.onclick = () => this.gamble();
      q('.info-btn').onclick = () => modal({ title: `${d.icon} ${d.title}`, html: d.info(this.bet), cls: 'wide' });

      this.onKey = (e) => {
        if (e.code !== 'Space' || document.querySelector('.modal-back, .celebrate')) return;
        e.preventDefault();
        this.spinBtn.click();
      };
      document.addEventListener('keydown', this.onKey);
    }

    destroy() {
      this.auto = 0;
      document.removeEventListener('keydown', this.onKey);
    }

    changeBet(dir) {
      if (this.busy || this.fs) return;
      this.betIdx = Math.max(0, Math.min(BETS.length - 1, this.betIdx + dir));
      Store.data.bets[this.def.id] = this.bet;
      Store.save();
      this.updateBet();
      Sound.play('click');
    }

    updateBet() {
      this.betEl.textContent = fmt(this.bet);
      if (this.buyBtn) this.buyBtn.innerHTML = `BONUS AL<small>${fmt(this.def.buy.cost * this.bet)}</small>`;
    }

    updateTurbo() { this.turboBtn.classList.toggle('on', this.turbo); }

    updateAuto() {
      this.autoBtn.classList.toggle('on', !!this.auto);
      this.autoBtn.textContent = this.auto ? `DUR ${this.auto === Infinity ? '∞' : this.auto}` : 'OTO';
      this.spinBtn.querySelector('.spin-txt').textContent = this.auto ? (this.auto === Infinity ? '∞' : this.auto) : '';
    }

    setControls() {
      const lock = this.busy || !!this.fs;
      this.betBtns.forEach((b) => { b.disabled = lock || !!this.auto; });
      if (this.buyBtn) this.buyBtn.disabled = lock || !!this.auto;
      if (this.gambleBtn) this.gambleBtn.disabled = lock || !!this.auto || !this.lastWin;
      this.spinBtn.classList.toggle('busy', this.busy && !this.auto);
      this.spinBtn.classList.toggle('auto', !!this.auto);
      this.updateAuto();
    }

    msg(html) { this.msgEl.innerHTML = html || ''; }
    showWin(spinRunning) { this.winEl.textContent = fmt((this.fs ? this.fs.total : 0) + spinRunning); }

    setExtra(html) {
      this.extraBadge.hidden = !html;
      this.extraBadge.innerHTML = html || '';
    }

    updateFs() {
      this.fsBadge.hidden = !this.fs;
      if (this.fs) this.fsBadge.innerHTML = `BEDAVA <b>${this.fs.played}</b>/${this.fs.played + this.fs.left}`;
    }

    async banner(title, sub) {
      const b = el(`<div class="banner"><div><b>${title}</b>${sub ? `<small>${sub}</small>` : ''}</div></div>`);
      document.body.appendChild(b);
      requestAnimationFrame(() => b.classList.add('show'));
      Sound.play('scatter');
      await sleep(this.t(1700));
      b.classList.remove('show');
      await sleep(250);
      b.remove();
    }

    async round() {
      if (this.busy || this.fs) return;
      const bet = this.bet;
      if (!Store.canBet(bet)) { this.stopAuto(); this.noMoney(); return; }
      this.busy = true;
      this.lastWin = 0;
      this.setControls();
      Store.sub(bet);
      Store.recordBet(bet);
      Jackpot.contribute(bet);
      this.showWin(0);
      this.msg('');
      let total = 0;
      try {
        const r = await this.def.play(this, { free: false });
        total = r.win;
        Store.add(r.win);
        if (r.fsAward) total += await this.freeSpins(r.fsAward);
        if (Jackpot.roll(bet)) {
          const j = Jackpot.take();
          await celebrate('💥 JACKPOT 💥', j, 'Ortak jackpot senin!');
          Store.add(j);
          total += j;
        } else if (!r.fsAward) {
          const tier = winTier(total, bet);
          if (tier) await celebrate(tier, total, `${(total / bet).toFixed(1)}× bahis`);
        }
        if (total) Store.recordWin(total, this.def.title);
        this.lastWin = r.fsAward ? 0 : total;
        this.showWin(total);
      } finally {
        this.busy = false;
        this.setControls();
      }
      if (this.auto) {
        this.auto--;
        this.updateAuto();
        if (this.auto > 0) { await sleep(this.t(300)); if (this.auto) this.round(); }
        else this.stopAuto();
      }
    }

    async freeSpins(n) {
      this.fs = { left: n, total: 0, played: 0 };
      this.updateFs();
      this.setControls();
      await this.banner(`${n} BEDAVA DÖNÜŞ!`, this.def.freeHint || '');
      if (this.def.startFree) await this.def.startFree(this);
      this.gameEl.classList.add('in-free');
      while (this.fs.left > 0) {
        this.fs.left--;
        this.fs.played++;
        this.updateFs();
        const r = await this.def.play(this, { free: true });
        this.fs.total += r.win;
        Store.add(r.win);
        this.showWin(0);
        if (r.fsAward) {
          this.fs.left += r.fsAward;
          this.updateFs();
          await this.banner(`+${r.fsAward} BEDAVA DÖNÜŞ`);
        }
        await sleep(this.t(450));
      }
      const { total, played } = this.fs;
      await celebrate('BEDAVA DÖNÜŞ BİTTİ', total, `${played} dönüşte ${(total / this.bet).toFixed(1)}× bahis`);
      if (this.def.endFree) this.def.endFree(this);
      this.gameEl.classList.remove('in-free');
      this.fs = null;
      this.updateFs();
      return total;
    }

    async buyBonus() {
      if (this.busy || this.fs || this.auto) return;
      const { cost, count } = this.def.buy;
      const price = cost * this.bet;
      if (!Store.canBet(price)) { toast('Bonus için bakiye yetmiyor'); return; }
      const ok = await modal({
        title: 'Bonus Satın Al',
        html: `<p>Doğrudan <b>${count} bedava dönüş</b> başlasın mı?</p>
               <p class="big-num">${fmt(price)} 🪙</p><p class="dim">${cost}× bahis</p>`,
        buttons: [{ label: 'Vazgeç', value: false, cls: 'ghost' }, { label: 'Satın Al', value: true, cls: 'gold' }],
      });
      if (!ok || this.busy) return;
      this.busy = true;
      this.lastWin = 0;
      this.setControls();
      Store.sub(price);
      Store.recordBet(price);
      Jackpot.contribute(price);
      this.showWin(0);
      try {
        const total = await this.freeSpins(count);
        if (total) Store.recordWin(total, this.def.title);
        this.showWin(total);
      } finally {
        this.busy = false;
        this.setControls();
      }
    }

    // Kırmızı/siyah kart: bilirse ikiye katlanır, en fazla 5 kez
    async gamble() {
      if (!this.lastWin || this.busy || this.auto) return;
      this.busy = true;
      this.setControls();
      let amount = this.lastWin;
      this.lastWin = 0;
      Store.sub(amount);
      const hist = [];
      let note = '';
      for (let step = 0; step < 5; step++) {
        const choice = await modal({
          title: '🃏 Risk Oyunu',
          dismiss: false,
          html: `<div class="gamble">
            <div class="card back"></div>
            ${note}
            <p>Kartın rengini bil, kazancın ikiye katlansın.</p>
            <p class="gamble-amt"><b>${fmt(amount)}</b> → <b class="gold-t">${fmt(amount * 2)}</b></p>
            <div class="hist">${hist.slice(0, 8).join('')}</div></div>`,
          buttons: [
            { label: '♥ KIRMIZI', value: 'red', cls: 'red' },
            { label: '♠ SİYAH', value: 'black', cls: 'dark' },
            { label: 'TOPLA', value: 'take', cls: 'gold' },
          ],
        });
        if (choice === 'take') break;
        const red = rng() < 0.5;
        const suit = red ? (rng() < 0.5 ? '♥' : '♦') : (rng() < 0.5 ? '♠' : '♣');
        hist.unshift(`<span class="${red ? 'r' : 'b'}">${suit}</span>`);
        if ((choice === 'red') === red) {
          amount *= 2;
          Sound.play('win');
          note = `<p class="ok-t">Kart <span class="${red ? 'r' : 'b'}">${suit}</span> — bildin!</p>`;
        } else {
          Sound.play('lose');
          await modal({
            title: 'Kaybettin',
            html: `<div class="gamble"><div class="card ${red ? 'r' : 'b'}">${suit}</div><p>Kazanç gitti.</p></div>`,
            buttons: [{ label: 'Tamam', value: true }],
          });
          amount = 0;
          break;
        }
      }
      Store.add(amount);
      this.showWin(amount);
      if (amount) toast(`${fmt(amount)} jeton toplandı`);
      this.busy = false;
      this.setControls();
    }

    async chooseAuto() {
      const n = await modal({
        title: 'Otomatik Oynat',
        html: '<p class="dim">Kaç dönüş? Bakiye bitince ya da DUR deyince durur.</p>',
        buttons: [10, 25, 50, 100].map((v) => ({ label: String(v), value: v }))
          .concat([{ label: '∞', value: Infinity }]),
      });
      if (!n) return;
      this.auto = n;
      this.setControls();
      this.round();
    }

    stopAuto() { this.auto = 0; this.setControls(); }

    async noMoney() {
      if (Store.dailyReady()) {
        const ok = await modal({
          title: 'Jeton bitti 😅',
          html: `<p>Günlük bedava jetonun hazır.</p><p class="big-num">+${fmt(Core.DAILY_BONUS)} 🪙</p>`,
          buttons: [{ label: 'Al', value: true, cls: 'gold' }],
        });
        if (ok) { Store.claimDaily(); Sound.play('big'); Core.coinRain(25); }
      } else {
        const ms = Store.msToMidnight();
        const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000);
        modal({
          title: 'Bakiye yetmiyor',
          html: `<p>Bahsi düşür ya da yarını bekle.</p><p class="dim">Yeni bedava jeton: ${h} sa ${m} dk sonra</p>`,
        });
      }
    }
  }

  // ——— Ortak parçalar ———

  const fmt2 = (n) => n.toLocaleString('tr-TR', { maximumFractionDigits: 2 });
  const emojiCell = (e) => `<span class="sym">${e}</span>`;

  function payTable(rows, head) {
    return `<table class="pay"><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr>
      ${rows.map((r) => `<tr>${r.map((x, i) => `<td${i === 0 ? ' class="ps"' : ''}>${x}</td>`).join('')}</tr>`).join('')}</table>`;
  }

  // Düşen sembol oyunları (Şeker Patlaması, Altın Madeni) için ortak oynatma akışı
  async function playCascade(shell, view, res, opts) {
    const t = (ms) => shell.t(ms);
    view.unmark('glow');
    Sound.play('spin');
    if (opts.onStart) opts.onStart(res);
    await view.setGrid(res.steps[0].grid, 'spin', t(420));
    Sound.play('stop');
    let run = 0;
    for (let i = 0; i < res.steps.length; i++) {
      const st = res.steps[i];
      if (!st.wins.length) break;
      const ids = [...new Set(st.wins.flatMap((w) => w.ids))];
      view.mark(ids, 'win');
      Sound.play('win');
      run += st.win;
      shell.msg(st.wins.map(opts.label).join(' · ') + (st.mult > 1 ? ` <b class="gold-t">×${st.mult}</b>` : ''));
      shell.showWin(Math.round(run));
      await sleep(t(800));
      await view.pop(ids, t(280));
      if (opts.afterTumble) opts.afterTumble(st);
      await view.setGrid(res.steps[i + 1].grid, 'tumble', t(320));
      Sound.play('drop');
    }
    if (res.mult) {
      view.mark(res.bombIds, 'glow');
      Sound.play('scatter');
      shell.msg(`💣 Bombalar patladı: ${fmt(res.tumbleWin)} × <b class="gold-t">${res.mult}</b> = <b>${fmt(res.tumbleWin * res.mult)}</b>`);
      await sleep(t(1400));
    }
    const need = opts.free ? 3 : 4;
    if (res.scN >= need) {
      view.mark(res.scIds, 'glow');
      Sound.play('scatter');
      shell.msg(`${opts.scEmoji} ×${res.scN} — bedava dönüş!` + (res.scatterWin ? ` +${fmt(res.scatterWin)}` : ''));
      await sleep(t(1200));
    }
    shell.showWin(res.total);
    if (res.total && !res.mult && res.scN < need) shell.msg(`Toplam kazanç: <b>${fmt(res.total)}</b>`);
    if (!res.total && !opts.free) shell.msg('');
    return { win: res.total, fsAward: res.fsAward };
  }

  // Makara oyunları (Klasik, Kitap) için çizgi gösterimi
  async function showLines(shell, view, res, logic, sym) {
    if (res.lineWins.length) {
      res.lineWins.forEach((w) => {
        view.drawLine(logic.LINES[w.line], w.n, LINE_COLORS[w.line % LINE_COLORS.length]);
        view.mark(w.cells, 'win');
      });
      Sound.play('win');
      shell.msg(res.lineWins.map((w) => `<span class="ln" style="--c:${LINE_COLORS[w.line]}">${w.line + 1}</span> ${w.n}× ${sym(w.s)} ${fmt(w.amount)}`).join(' · '));
      shell.showWin(Math.round(res.lineWins.reduce((a, w) => a + w.amount, 0)));
      await sleep(shell.t(1100));
    }
  }

  // ——— 1) Şeker Patlaması ———
  const T = L.tumble;
  const sweet = {
    id: 'sweet', title: 'Şeker Patlaması', icon: '🍭', ar: 6 / 5,
    desc: '6×5 alan. Aynı sembolden 8 tane olunca patlar, yenileri yağar. Bedava dönüşte çarpan bombaları ×100’e kadar.',
    tags: ['Düşen semboller', 'Çarpan bombası', 'Bonus al'],
    buy: { cost: T.BUY, count: T.FS },
    freeHint: 'Çarpan bombaları devrede 💣',
    render(cell) {
      if (cell.s === 'bomb') return `<span class="sym">💣</span><b class="mult">×${cell.m}</b>`;
      return emojiCell(T.BY[cell.s].e);
    },
    mount(stage) {
      this.view = new GridView(stage, { cols: T.COLS, render: (c) => this.render(c) });
      this.view.setGrid(T.randomGrid(rng), 'instant');
    },
    play(shell, { free }) {
      const res = T.spin(shell.bet, rng, free);
      return playCascade(shell, this.view, res, {
        free, scEmoji: T.SC.e,
        label: (w) => `${w.n}× ${T.BY[w.s].e} ${fmt(w.amount)}`,
      });
    },
    info(bet) {
      return `<p>Sembollerin yeri önemli değil: ekranın herhangi bir yerinde <b>8 veya daha fazla</b> aynı sembol varsa kazanırsın. Kazananlar patlar, üstten yenileri düşer, yeni kazanç kalmayana kadar sürer.</p>
        ${payTable(T.SYMS.map((s) => [s.e, ...s.pay.map((p) => fmt2(p * bet))]), ['', '8-9', '10-11', '12+'])}
        <p>${T.SC.e} <b>Gökkuşağı</b> her yerden sayılır: 4 tane → ${fmt(3 * bet)}, 5 → ${fmt(5 * bet)}, 6 → ${fmt(100 * bet)} ve <b>${T.FS} bedava dönüş</b>. Bedava dönüşte 3 gökkuşağı +5 dönüş verir.</p>
        <p>💣 <b>Çarpan bombası</b> yalnız bedava dönüşte gelir (×2 – ×100). Düşüşler bitince ekrandaki bombalar toplanır ve o dönüşün kazancıyla çarpılır.</p>
        <p class="dim">Bonus al: ${T.BUY}× bahis. Teorik geri ödeme ≈ %96.</p>`;
    },
  };

  // ——— 2) Altın Madeni (Megaways) ———
  const M = L.megaways;
  const mine = {
    id: 'mine', title: 'Altın Madeni', icon: '⛏️', ar: 6 / 5,
    desc: 'Her dönüşte makara boyları değişir, 117.649 yola kadar. Kazananlar patlar; bedava dönüşte çarpan her patlamada büyür.',
    tags: ['Megaways', 'Büyüyen çarpan', 'Bonus al'],
    buy: { cost: M.BUY, count: M.FS },
    freeHint: 'Her patlamada çarpan +1',
    state: { mult: 1 },
    mount(stage, shell) {
      this.shell = shell;
      this.view = new GridView(stage, { cols: M.REELS, render: (c) => emojiCell(M.BY[c.s].e) });
      this.view.setGrid(M.randomGrid(rng), 'instant');
    },
    badge(res) {
      const mult = this.shell.fs ? ` · <b>×${this.state.mult}</b>` : '';
      this.shell.setExtra(`${fmt(res.ways)} YOL${mult}`);
    },
    startFree() { this.state = { mult: 1 }; },
    endFree(shell) { this.state = { mult: 1 }; shell.setExtra(null); },
    play(shell, { free }) {
      if (!free) this.state = { mult: 1 };
      const res = M.spin(shell.bet, rng, free, this.state);
      return playCascade(shell, this.view, res, {
        free, scEmoji: M.SC.e,
        onStart: (r) => this.badge(r),
        afterTumble: () => this.badge(res),
        label: (w) => `${M.BY[w.s].e} ${w.k} makara · ${fmt(w.ways)} yol ${fmt(w.amount)}`,
      });
    },
    info(bet) {
      return `<p>6 makara, her biri her dönüşte 2-7 sembol yüksekliğinde. Soldan başlayıp yan yana makaralarda aynı sembol çıkarsa kazanırsın; her makaradaki adetlerin çarpımı <b>yol sayısıdır</b>, kazanç yol sayısıyla çarpılır.</p>
        ${payTable(M.SYMS.map((s) => [s.e, ...s.pay.map((p) => fmt2(p * bet * M.SCALE))]), ['', '3', '4', '5', '6'])}
        <p class="dim">Tablo: yol başına ödeme.</p>
        <p>${M.WILD.e} <b>Joker</b> 2-5. makaralarda çıkar, her sembolün yerine geçer.</p>
        <p>${M.SC.e} <b>4+ elmas</b> → 12 bedava dönüş (her ek elmas +5). Bedava dönüşte her patlama çarpanı 1 artırır ve dönüşler boyunca sıfırlanmaz. 3 elmas +5 dönüş.</p>
        <p class="dim">Bonus al: ${M.BUY}× bahis. Teorik geri ödeme ≈ %96.</p>`;
    },
  };

  // ——— 3) Firavunun Kitabı ———
  const B = L.book;
  const bookSym = (s) => {
    const x = B.BY[s];
    return x.e.length <= 2 && /^[A-Z0-9]+$/.test(x.e) ? `<span class="letter l-${s}">${x.e}</span>` : emojiCell(x.e);
  };
  const book = {
    id: 'book', title: 'Firavunun Kitabı', icon: '📕', ar: 5 / 3,
    desc: '5 makara, 10 çizgi. Kitap hem joker hem scatter. Bedava dönüşte özel sembol bütün makarayı kaplar.',
    tags: ['5 makara', 'Genişleyen sembol', 'Risk oyunu'],
    gamble: true,
    freeHint: 'Kitap özel sembolü seçecek…',
    state: null,
    mount(stage) {
      this.view = new ReelView(stage, { cols: B.REELS, rows: B.ROWS, render: bookSym, randomSym: () => B.randomSymbol(rng) });
      this.view.setStatic(B.spin(10, rng, false).grid);
    },
    async startFree(shell) {
      this.state = { special: B.pickSpecial(rng) };
      const sp = B.BY[this.state.special];
      await modal({
        title: '📕 Kitap açıldı!', dismiss: false, cls: 'reveal',
        html: `<div class="book-reveal"><div class="big-sym">${bookSym(sp.s)}</div>
          <p>Özel genişleyen sembol: <b>${sp.name}</b></p>
          <p class="dim">${Object.keys(sp.pay)[0]}+ makarada çıkarsa makaraları kaplar ve 10 çizginin hepsinden öder.</p></div>`,
        buttons: [{ label: 'Başla', value: true, cls: 'gold' }],
      });
      shell.setExtra(`ÖZEL ${bookSym(sp.s)}`);
    },
    endFree(shell) { this.state = null; shell.setExtra(null); },
    async play(shell, { free }) {
      const t = (ms) => shell.t(ms);
      const res = B.spin(shell.bet, rng, free, this.state);
      this.view.unmark('win'); this.view.unmark('glow'); this.view.clearLines();
      // 2 kitap düştüyse kalan makaralar heyecan için yavaşlar
      const durs = [];
      let books = 0, extra = 0;
      res.grid.forEach((col, c) => {
        if (books >= 2) extra += t(750);
        durs.push(t(650) + c * t(170) + extra);
        books += col.filter((s) => s === 'book').length;
      });
      Sound.play('spin');
      let seen = 0;
      await this.view.spin(res.grid, durs, (c) => {
        Sound.play('stop');
        seen += res.grid[c].filter((s) => s === 'book').length;
        if (seen >= 2 && c < B.REELS - 1 && res.grid[c].includes('book')) {
          Sound.play('tease');
          this.view.reels.slice(c + 1).forEach((r) => r.reel.classList.add('tease'));
        }
        this.view.reels[c].reel.classList.remove('tease');
      });
      await showLines(shell, this.view, res, B, bookSym);
      if (res.scN >= 3) {
        this.view.mark(res.scCells, 'glow');
        Sound.play('scatter');
        shell.msg(`📕 ×${res.scN} → +${fmt(res.scatterWin)} ve ${res.fsAward} bedava dönüş!`);
        await sleep(t(1300));
      }
      if (res.expand) {
        const sp = B.BY[res.expand.s];
        res.expand.reels.forEach((c, i) => {
          const o = el(`<div class="expand-col" style="animation-delay:${i * 120}ms">${bookSym(sp.s)}</div>`);
          this.view.reels[c].reel.appendChild(o);
        });
        Sound.play('big');
        shell.msg(`${bookSym(sp.s)} genişledi! ${res.expand.n} makara × 10 çizgi = <b class="gold-t">${fmt(res.expand.amount)}</b>`);
        shell.showWin(res.total);
        await sleep(t(1800));
        this.view.root.querySelectorAll('.expand-col').forEach((n) => n.remove());
      }
      shell.showWin(res.total);
      if (res.total && !res.expand && res.scN < 3) shell.msg(shell.msgEl.innerHTML + ` = <b>${fmt(res.total)}</b>`);
      if (!res.total && !free) shell.msg('');
      return { win: res.total, fsAward: res.fsAward };
    },
    info(bet) {
      const lb = bet / 10;
      return `<p>10 sabit çizgi, soldan sağa. Çizgi bahsi = bahis / 10 = ${fmt(lb)}.</p>
        ${payTable(B.SYMS.map((s) => [bookSym(s.s), ...[2, 3, 4, 5].map((n) => (s.pay[n] ? fmt(s.pay[n] * lb) : '–'))]), ['', '2', '3', '4', '5'])}
        <p>📕 <b>Kitap</b> her sembolün yerine geçer ve her yerden sayılır: 3 → ${fmt(2 * bet)}, 4 → ${fmt(20 * bet)}, 5 → ${fmt(200 * bet)} ve <b>10 bedava dönüş</b> (bedava dönüşte de yeniden tetiklenir).</p>
        <p>Bedava dönüş başında rastgele bir <b>özel sembol</b> seçilir. Yeterince makarada çıkarsa (bitişik olmasa da) o makaraları baştan sona kaplar ve 10 çizginin hepsinden öder.</p>
        <p>🃏 <b>Risk:</b> kazançtan sonra kartın rengini bilirsen ikiye katlanır (5 kereye kadar).</p>
        <p class="dim">Teorik geri ödeme ≈ %97.</p>`;
    },
  };

  // ——— 4) Klasik Meyve ———
  const C = L.classic;
  const classicSym = (s) => {
    if (s === 'seven') return '<span class="seven">7</span>';
    if (s === 'bar') return '<span class="bar-sym">BAR</span>';
    return emojiCell(C.BY[s].e);
  };
  const classic = {
    id: 'classic', title: 'Klasik Meyve', icon: '🍒', ar: 1.15,
    desc: 'Eski usul 3 makaralı meyve makinesi. 5 çizgi, üç 7 = 500× çizgi bahsi. Sade ve hızlı.',
    tags: ['3 makara', '5 çizgi', 'Risk oyunu'],
    gamble: true,
    mount(stage) {
      this.view = new ReelView(stage, { cols: C.REELS, rows: C.ROWS, render: classicSym, randomSym: () => C.randomSymbol(rng) });
      this.view.setStatic(C.spin(10, rng).grid);
    },
    async play(shell) {
      const res = C.spin(shell.bet, rng);
      this.view.unmark('win'); this.view.clearLines();
      Sound.play('spin');
      await this.view.spin(res.grid, [0, 1, 2].map((c) => shell.t(550) + c * shell.t(260)), () => Sound.play('stop'));
      await showLines(shell, this.view, res, C, classicSym);
      shell.showWin(res.total);
      if (!res.total) shell.msg('');
      return { win: res.total, fsAward: 0 };
    },
    info(bet) {
      const lb = bet / 5;
      return `<p>5 çizgi: orta, üst, alt ve iki çapraz. Çizgi bahsi = ${fmt(lb)}. Üç aynı sembol soldan sağa dizilmeli; kiraz ilk iki makarada da öder.</p>
        ${payTable(C.SYMS.map((s) => [classicSym(s.s), s.pay[2] ? fmt(s.pay[2] * lb) : '–', fmt(s.pay[3] * lb)]), ['', '2', '3'])}
        <p>🃏 <b>Risk:</b> kazançtan sonra kartın rengini bilirsen ikiye katlanır (5 kereye kadar).</p>
        <p class="dim">Teorik geri ödeme ≈ %96.</p>`;
    },
  };

  window.Games = { list: [sweet, mine, book, classic], GameShell };
})();
