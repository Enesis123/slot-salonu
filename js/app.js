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

  refreshTop();
  const start = location.hash.slice(1);
  if (start) open(start); else lobby();
})();
