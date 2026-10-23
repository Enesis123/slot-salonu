// İki görünüm: düşen semboller için GridView, dönen makaralar için ReelView
(function () {
  'use strict';
  const { sleep, Sound } = window.Core;
  const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

  // Her hücre kimliğiyle izlenir; yeri değişince CSS geçişiyle kayar
  class GridView {
    constructor(root, { cols, render }) {
      this.root = root;
      this.cols = cols;
      this.render = render;
      this.cells = new Map();
      root.classList.add('grid-view');
    }

    place(node, c, r, rows) {
      node.style.left = (c * 100) / this.cols + '%';
      node.style.width = 100 / this.cols + '%';
      node.style.height = 100 / rows + '%';
      node.style.transform = `translateY(${r * 100}%)`;
    }

    create(cell, c, rowsInCol) {
      const node = document.createElement('div');
      node.className = 'cell';
      node.innerHTML = this.render(cell);
      node.dataset.s = cell.s;
      this.root.appendChild(node);
      this.cells.set(cell.id, node);
      node.style.height = 100 / rowsInCol + '%';
      return node;
    }

    // mode: 'instant' | 'spin' (eskiler aşağı düşer, yeniler gelir) | 'tumble' (sadece boşluklar dolar)
    async setGrid(grid, mode, dur) {
      const fresh = [];
      if (mode !== 'tumble') {
        const old = [...this.cells.values()];
        this.cells.clear();
        if (mode === 'spin') {
          old.forEach((n) => { n.classList.add('leave'); n.style.transform += ' translateY(700%)'; });
          setTimeout(() => old.forEach((n) => n.remove()), dur);
        } else old.forEach((n) => n.remove());
      }
      grid.forEach((col, c) => {
        const rows = col.length;
        let newCount = col.filter((cell) => !this.cells.has(cell.id)).length;
        let k = 0;
        col.forEach((cell, r) => {
          let node = this.cells.get(cell.id);
          if (!node) {
            node = this.create(cell, c, rows);
            if (mode === 'instant') { this.place(node, c, r, rows); return; }
            // Sütunun üstünden başlat, sırayla düşsün
            node.style.transition = 'none';
            node.style.left = (c * 100) / this.cols + '%';
            node.style.width = 100 / this.cols + '%';
            node.style.transform = `translateY(${(k - newCount) * 100 - (mode === 'spin' ? 30 : 0)}%)`;
            k++;
            node.style.transitionDelay = mode === 'spin' ? c * (dur * 0.12) + 'ms' : '0ms';
            fresh.push([node, c, r, rows]);
          } else {
            node.style.transitionDelay = '0ms';
            this.place(node, c, r, rows);
          }
        });
      });
      if (mode === 'instant') return;
      await frame();
      fresh.forEach(([node, c, r, rows]) => { node.style.transition = ''; this.place(node, c, r, rows); });
      const total = dur + (mode === 'spin' ? this.cols * dur * 0.12 : 0);
      await sleep(total);
      fresh.forEach(([node]) => { node.style.transitionDelay = '0ms'; });
    }

    get(id) { return this.cells.get(id); }
    mark(ids, cls) { ids.forEach((id) => { const n = this.cells.get(id); if (n) n.classList.add(cls); }); }
    unmark(cls) { this.cells.forEach((n) => n.classList.remove(cls)); }

    async pop(ids, dur) {
      this.mark(ids, 'pop');
      Sound.play('pop');
      await sleep(dur);
      ids.forEach((id) => { const n = this.cells.get(id); if (n) { n.remove(); this.cells.delete(id); } });
    }
  }

  // Makara: final semboller şeridin üstünde, eski görünen altta; şerit aşağı kayarak durur
  class ReelView {
    constructor(root, { cols, rows, render, randomSym }) {
      this.root = root;
      this.cols = cols;
      this.rows = rows;
      this.render = render;
      this.randomSym = randomSym;
      this.reels = [];
      this.grid = null;
      root.classList.add('reel-view');
      for (let c = 0; c < cols; c++) {
        const reel = document.createElement('div');
        reel.className = 'reel';
        const strip = document.createElement('div');
        strip.className = 'strip';
        reel.appendChild(strip);
        root.appendChild(reel);
        this.reels.push({ reel, strip });
      }
      this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      this.svg.setAttribute('class', 'lines');
      this.svg.setAttribute('viewBox', `0 0 ${cols * 100} ${rows * 100}`);
      this.svg.setAttribute('preserveAspectRatio', 'none');
      root.appendChild(this.svg);
    }

    cellHtml(s) { return `<div class="rcell" data-s="${s}">${this.render(s)}</div>`; }

    setStatic(grid) {
      this.grid = grid;
      grid.forEach((col, c) => {
        const { strip } = this.reels[c];
        strip.style.transition = 'none';
        strip.style.transform = 'translateY(0)';
        strip.classList.remove('blur');
        strip.innerHTML = col.map((s) => this.cellHtml(s)).join('');
        strip.querySelectorAll('.rcell').forEach((n) => { n.style.height = 100 / this.rows + '%'; });
        strip.style.height = '100%';
      });
    }

    // durations: makara başına milisaniye; onStop(c) her makara durunca
    async spin(grid, durations, onStop) {
      const h = this.reels[0].reel.clientHeight / this.rows;
      const jobs = grid.map((col, c) => {
        const { strip } = this.reels[c];
        const filler = Math.max(6, Math.round(durations[c] / 45));
        const extra = [this.randomSym()];
        for (let i = 0; i < filler; i++) extra.push(this.randomSym());
        const oldCol = this.grid ? this.grid[c] : col;
        const items = [extra[0], ...col, ...extra.slice(1), ...oldCol];
        strip.style.transition = 'none';
        strip.style.height = items.length * h + 'px';
        strip.innerHTML = items.map((s) => this.cellHtml(s)).join('');
        strip.querySelectorAll('.rcell').forEach((n) => { n.style.height = h + 'px'; });
        const from = -(items.length - this.rows) * h;
        strip.style.transform = `translateY(${from}px)`;
        return { strip, c };
      });
      await frame();
      jobs.forEach(({ strip, c }) => {
        strip.classList.add('blur');
        strip.style.transition = `transform ${durations[c]}ms cubic-bezier(.3,.55,.35,1)`;
        strip.style.transform = `translateY(${-h}px)`;
      });
      await Promise.all(jobs.map(({ strip, c }) => sleep(durations[c]).then(() => {
        strip.classList.remove('blur');
        const reel = this.reels[c].reel;
        reel.classList.remove('bounce'); void reel.offsetWidth; reel.classList.add('bounce');
        if (onStop) onStop(c);
      })));
      this.setStatic(grid);
    }

    cell(c, r) { return this.reels[c].strip.children[r]; }
    mark(cells, cls) { cells.forEach(([c, r]) => { const n = this.cell(c, r); if (n) n.classList.add(cls); }); }
    unmark(cls) { this.root.querySelectorAll('.' + cls).forEach((n) => n.classList.remove(cls)); }

    drawLine(rowsByReel, n, color) {
      const pts = rowsByReel.map((r, c) => `${c * 100 + 50},${r * 100 + 50}`).join(' ');
      const p = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
      p.setAttribute('points', pts);
      p.setAttribute('stroke', color);
      p.setAttribute('class', n < rowsByReel.length ? 'partial' : '');
      this.svg.appendChild(p);
    }
    clearLines() { this.svg.innerHTML = ''; }
  }

  window.Views = { GridView, ReelView };
})();
