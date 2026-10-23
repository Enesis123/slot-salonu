// Lobi, üst çubuk ve oyunlar arası geçiş
(function () {
  'use strict';
  const { Store, Jackpot, Sound, fmt, toast, modal, coinRain } = window.Core;
  const { list, GameShell } = window.Games;
  const view = document.getElementById('view');
  const homeBtn = document.getElementById('btnHome');
  const balEl = document.getElementById('balVal');
  const jpEl = document.getElementById('jpVal');
  let shell = null;

  function refreshTop() {
    balEl.textContent = fmt(Store.data.balance);
    jpEl.textContent = fmt(Jackpot.value);
  }
  Store.onChange(refreshTop);

  function lobby() {
    if (shell) { shell.destroy(); shell = null; }
    homeBtn.hidden = true;
    if (location.hash) history.replaceState(null, '', location.pathname);
    const s = Store.data.stats;
    const rtp = s.wagered ? ((s.won / s.wagered) * 100).toFixed(1) + '%' : '–';
    const ready = Store.dailyReady();
    view.innerHTML = `
      <section class="lobby">
        <div class="hero">
          <div class="daily ${ready ? 'ready' : ''}">
            <div><small>GÜNLÜK HEDİYE</small><b>+${fmt(Core.DAILY_BONUS)} 🪙</b></div>
            <button class="btn gold daily-btn" ${ready ? '' : 'disabled'}>${ready ? 'Al' : countdown()}</button>
          </div>
          <div class="stats">
            <div><small>DÖNÜŞ</small><b>${fmt(s.spins)}</b></div>
            <div><small>GERİ ÖDEME</small><b>${rtp}</b></div>
            <div><small>EN BÜYÜK</small><b>${fmt(s.biggest)}</b></div>
            <div><small>JACKPOT</small><b>${s.jackpots}</b></div>
          </div>
        </div>
        <div class="cards">
          ${list.map((g) => `
            <button class="card-game theme-${g.id}" data-id="${g.id}">
              <div class="card-art"><span>${g.icon}</span></div>
              <div class="card-body">
                <h3>${g.title}</h3>
                <p>${g.desc}</p>
                <div class="tags">${g.tags.map((t) => `<span>${t}</span>`).join('')}</div>
              </div>
            </button>`).join('')}
        </div>
        <footer class="foot">
          <span>Gerçek para yok, sadece eğlence. Jetonlar bu tarayıcıda saklanır.</span>
          <span class="foot-btns">
            <button class="link sound-btn">${Store.data.sound ? '🔊 Ses açık' : '🔇 Ses kapalı'}</button>
            <button class="link reset-btn">Sıfırla</button>
          </span>
        </footer>
      </section>`;
    view.querySelectorAll('.card-game').forEach((b) => { b.onclick = () => { Sound.play('click'); open(b.dataset.id); }; });
    view.querySelector('.daily-btn').onclick = () => {
      const got = Store.claimDaily();
      if (got) { Sound.play('big'); coinRain(30); toast(`+${fmt(got)} jeton!`); lobby(); }
    };
    view.querySelector('.sound-btn').onclick = () => { Store.data.sound = !Store.data.sound; Store.save(); lobby(); };
    view.querySelector('.reset-btn').onclick = async () => {
      const ok = await modal({
        title: 'Her şeyi sıfırla?',
        html: '<p>Bakiye 10.000 jetona döner, istatistikler silinir.</p>',
        buttons: [{ label: 'Vazgeç', value: false, cls: 'ghost' }, { label: 'Sıfırla', value: true, cls: 'red' }],
      });
      if (ok) { Store.resetAll(); lobby(); }
    };
  }

  function countdown() {
    const ms = Store.msToMidnight();
    return `${Math.floor(ms / 3600000)} sa ${Math.floor((ms % 3600000) / 60000)} dk`;
  }

  function open(id) {
    const def = list.find((g) => g.id === id);
    if (!def) return lobby();
    if (shell) shell.destroy();
    homeBtn.hidden = false;
    history.replaceState(null, '', '#' + id);
    shell = new GameShell(def, view);
    window.scrollTo(0, 0);
  }

  homeBtn.onclick = () => {
    if (shell && (shell.busy || shell.fs)) { toast('Dönüş bitince çıkabilirsin'); return; }
    Sound.play('click');
    lobby();
  };

  // Ana ekrandan açılınca çevrimdışı da çalışsın (file:// altında çalışmaz, atlanır)
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  // Gizli admin paneli: bakiyeye 2 saniye içinde 5 kez dokun, sonra şifre
  let taps = [];
  document.querySelector('.balance').addEventListener('click', () => {
    const now = Date.now();
    taps = taps.filter((t) => now - t < 2000).concat(now);
    if (taps.length >= 5) {
      taps = [];
      if (shell && (shell.busy || shell.fs)) { toast('Dönüş bitince açabilirsin'); return; }
      unlockAdmin().then((ok) => { if (ok) openAdmin(); });
    }
  });

  const SESSION_KEY = 'slotSalonu.admin';
  const LOCK_KEY = 'slotSalonu.adminLock';
  const SESSION_MS = 30 * 60 * 1000;
  const MAX_FAILS = 5;
  const LOCK_MS = 5 * 60 * 1000;

  const readJson = (st, k) => { try { return JSON.parse(st.getItem(k)) || null; } catch (e) { return null; } };
  const writeJson = (st, k, v) => { try { st.setItem(k, JSON.stringify(v)); } catch (e) { /* kayıt yok */ } };

  async function checkPassword(pass) {
    const key = window.ADMIN_KEY;
    const enc = new TextEncoder();
    const salt = new Uint8Array(key.salt.match(/../g).map((h) => parseInt(h, 16)));
    const base = await crypto.subtle.importKey('raw', enc.encode(pass), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: key.iter, hash: 'SHA-256' }, base, 256);
    const hex = [...new Uint8Array(bits)].map((b) => b.toString(16).padStart(2, '0')).join('');
    return hex === key.hash;
  }

  // Doğru şifreden sonra 30 dakika boyunca bu sekmede tekrar sormaz
  function unlockAdmin() {
    const key = window.ADMIN_KEY;
    if (!key) { toast('Admin şifresi henüz ayarlanmamış'); return Promise.resolve(false); }
    if (!(window.crypto && crypto.subtle)) { toast('Admin paneli sadece siteden açılır'); return Promise.resolve(false); }
    const sess = readJson(sessionStorage, SESSION_KEY);
    if (sess && sess.hash === key.hash && Date.now() < sess.until) return Promise.resolve(true);
    const lock = readJson(localStorage, LOCK_KEY) || { fails: 0, until: 0 };
    if (Date.now() < lock.until) {
      toast(`Çok fazla yanlış deneme. ${Math.ceil((lock.until - Date.now()) / 60000)} dk bekle`);
      return Promise.resolve(false);
    }
    return modal({
      title: '🔒 Admin girişi',
      html: `<input class="adm-input adm-pass" type="password" autocomplete="current-password" placeholder="Şifre">
        <p class="adm-err dim"></p>`,
      buttons: [{ label: 'Vazgeç', value: false, cls: 'ghost' }, { label: 'Gir', value: true, cls: 'gold' }],
      onOpen(m, close) {
        const input = m.querySelector('.adm-pass');
        const err = m.querySelector('.adm-err');
        const go = m.querySelector('.btn.gold');
        go.onclick = async () => {
          if (!input.value) return;
          go.disabled = true;
          const ok = await checkPassword(input.value);
          go.disabled = false;
          if (ok) {
            writeJson(localStorage, LOCK_KEY, { fails: 0, until: 0 });
            writeJson(sessionStorage, SESSION_KEY, { hash: key.hash, until: Date.now() + SESSION_MS });
            close(true);
            return;
          }
          lock.fails++;
          if (lock.fails >= MAX_FAILS) {
            writeJson(localStorage, LOCK_KEY, { fails: 0, until: Date.now() + LOCK_MS });
            toast('Çok fazla yanlış deneme. 5 dk kilitlendi');
            close(false);
            return;
          }
          writeJson(localStorage, LOCK_KEY, lock);
          Sound.play('lose');
          err.textContent = `Yanlış şifre. Kalan hak: ${MAX_FAILS - lock.fails}`;
          input.value = '';
          m.querySelector('.modal').classList.remove('shake'); void m.offsetWidth;
          m.querySelector('.modal').classList.add('shake');
          input.focus();
        };
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter') go.click(); });
        setTimeout(() => input.focus(), 50);
      },
    });
  }

  function openAdmin() {
    Sound.play('click');
    modal({
      title: '🛠️ Admin',
      html: `<label class="adm-label">Bakiye</label>
        <input class="adm-input" type="text" inputmode="numeric" value="${Store.data.balance}">
        <div class="adm-quick">
          ${[10000, 100000, 1000000].map((v) => `<button class="pill" data-add="${v}">+${fmt(v)}</button>`).join('')}
          <button class="pill" data-set="0">Sıfır</button>
        </div>
        <button class="link adm-daily">Günlük hediyeyi yeniden aç</button>`,
      buttons: [{ label: 'Vazgeç', value: null, cls: 'ghost' }, { label: 'Kaydet', value: 'save', cls: 'gold' }],
      onOpen(m, close) {
        const input = m.querySelector('.adm-input');
        const num = () => parseInt(input.value.replace(/\D/g, ''), 10) || 0;
        m.querySelectorAll('[data-add]').forEach((b) => { b.onclick = () => { input.value = num() + +b.dataset.add; }; });
        m.querySelector('[data-set]').onclick = () => { input.value = 0; };
        m.querySelector('.adm-daily').onclick = () => {
          Store.data.lastDaily = null; Store.save(); toast('Günlük hediye yeniden alınabilir');
          if (!shell) lobby();
        };
        m.querySelector('.btn.gold').onclick = () => {
          Store.setBalance(num());
          toast(`Bakiye: ${fmt(Store.data.balance)}`);
          close('save');
        };
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter') m.querySelector('.btn.gold').click(); });
        setTimeout(() => input.select(), 50);
      },
    });
  }

  refreshTop();
  const start = location.hash.slice(1);
  if (start) open(start); else lobby();
})();
