// Fırlatmalı oyunların karakterleri: yapay zekâyla çizilip zemini kesilmiş resimler (art/raw → tools/kes.py → img/).
// hand: mermi çıkış noktası, resmin genişlik/yüksekliğine oranla.
(function () {
  'use strict';

  const CHARS = {
    dede: { src: 'img/dede.webp', alt: 'Büyücü dede', hand: [0.9, 0.27] },
    amazon: { src: 'img/amazon.webp', alt: 'Amazon kraliçesi', hand: [0.97, 0.66] },
  };

  function html(kind) {
    const c = CHARS[kind];
    return `<div class="char-fig"><img src="${c.src}" alt="${c.alt}" draggable="false">
      <span class="hand" style="left:${c.hand[0] * 100}%;top:${c.hand[1] * 100}%"></span></div>`;
  }

  window.Characters = { html };
})();
