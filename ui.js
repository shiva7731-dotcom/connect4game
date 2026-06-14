'use strict';

/**
 * GameUI — wires the ConnectFour game to the DOM.
 * Handles: board rendering, hover preview, falling animation,
 * win/draw detection feedback, score tracking, and modals.
 */
class GameUI {
  constructor() {
    this.game   = new ConnectFour();
    this.scores = [0, 0];   // index 0 = P1, index 1 = P2
    this.busy   = false;    // true while a disc is animating
    this.hoverCol = -1;
    this.cells  = [];       // cells[row][col] => <div class="cell">

    // DOM refs
    this.$board      = document.getElementById('board');
    this.$previewRow = document.getElementById('preview-row');
    this.$preview    = document.getElementById('preview-disc');
    this.$turnChip   = document.getElementById('turn-chip');
    this.$turnText   = document.getElementById('turn-text');
    this.$cardP1     = document.getElementById('card-p1');
    this.$cardP2     = document.getElementById('card-p2');
    this.$scoreP1    = document.getElementById('score-p1');
    this.$scoreP2    = document.getElementById('score-p2');
    this.$modalBg    = document.getElementById('modal-bg');
    this.$modalIcon  = document.getElementById('modal-icon');
    this.$modalHead  = document.getElementById('modal-heading');
    this.$modalMsg   = document.getElementById('modal-msg');

    this.buildBoard();
    this.bindEvents();
    this.syncTurnUI();
  }

  /* ─── Board DOM ─── */

  buildBoard() {
    this.$board.innerHTML = '';
    this.cells = [];

    for (let r = 0; r < this.game.ROWS; r++) {
      const row = [];
      for (let c = 0; c < this.game.COLS; c++) {
        const el = document.createElement('div');
        el.className = 'cell';
        el.dataset.col = c;
        this.$board.appendChild(el);
        row.push(el);
      }
      this.cells.push(row);
    }
  }

  /* ─── Event Binding ─── */

  bindEvents() {
    // Mouse hover — column highlight + preview disc
    this.$board.addEventListener('mousemove', e => {
      if (this.busy || this.game.gameOver) return;
      const col = this.colFromXY(e.clientX, e.clientY);
      if (col !== this.hoverCol) {
        this.hoverCol = col;
        this.applyHover(col);
        this.movePreview(col);
      }
    });

    this.$board.addEventListener('mouseleave', () => {
      this.hoverCol = -1;
      this.clearHover();
      this.$preview.style.opacity = '0';
    });

    // Click — drop disc
    this.$board.addEventListener('click', e => {
      if (this.busy || this.game.gameOver) return;
      const col = this.colFromXY(e.clientX, e.clientY);
      if (col >= 0) this.handleDrop(col);
    });

    // Touch support
    this.$board.addEventListener('touchend', e => {
      if (this.busy || this.game.gameOver) return;
      e.preventDefault();
      const t = e.changedTouches[0];
      const col = this.colFromXY(t.clientX, t.clientY);
      if (col >= 0) this.handleDrop(col);
    }, { passive: false });

    // Buttons
    document.getElementById('btn-restart').addEventListener('click', () => this.restartRound());
    document.getElementById('btn-new').addEventListener('click',     () => this.newGame());
    document.getElementById('btn-again').addEventListener('click',   () => this.restartRound());
    document.getElementById('btn-modal-new').addEventListener('click', () => this.newGame());
  }

  colFromXY(x, y) {
    const rect = this.$board.getBoundingClientRect();
    if (x < rect.left || x > rect.right) return -1;
    const col = Math.floor(((x - rect.left) / rect.width) * this.game.COLS);
    return Math.max(0, Math.min(this.game.COLS - 1, col));
  }

  /* ─── Hover ─── */

  applyHover(col) {
    this.clearHover();
    if (col < 0 || !this.game.canDrop(col)) return;
    for (let r = 0; r < this.game.ROWS; r++) {
      this.cells[r][col].classList.add('hovered');
    }
  }

  clearHover() {
    this.$board.querySelectorAll('.cell.hovered')
      .forEach(el => el.classList.remove('hovered'));
  }

  movePreview(col) {
    if (col < 0 || !this.game.canDrop(col)) {
      this.$preview.style.opacity = '0';
      return;
    }

    // Center preview disc over the column using real DOM positions
    const cell     = this.cells[0][col];
    const cellRect = cell.getBoundingClientRect();
    const rowRect  = this.$previewRow.getBoundingClientRect();
    const discW    = 40; // matches CSS
    const left     = (cellRect.left + cellRect.right) / 2 - rowRect.left - discW / 2;

    this.$preview.style.left    = left + 'px';
    this.$preview.style.opacity = '0.92';
    this.$preview.className =
      'preview-disc ' + (this.game.currentPlayer === 1 ? 'p1' : 'p2');
  }

  /* ─── Drop & Animation ─── */

  async handleDrop(col) {
    if (!this.game.canDrop(col)) return;

    this.busy = true;
    this.$preview.style.opacity = '0';
    this.clearHover();

    const result = this.game.drop(col);
    if (!result) { this.busy = false; return; }

    await this.animateFall(result.row, col, result.player);

    if (result.win) {
      this.scores[result.player - 1]++;
      this.updateScores();
      this.highlightWin(this.game.winCells, result.player);
      await this.delay(750);
      this.showModal(result.player, false);

    } else if (result.draw) {
      await this.delay(400);
      this.showModal(null, true);

    } else {
      this.syncTurnUI();
    }

    this.busy = false;
  }

  /**
   * Animates a disc falling from the top of the board down to (targetRow, col).
   * A "fly-disc" div is absolutely positioned within the board (overflow:hidden
   * clips it until it enters the visible area), then transitions to the target.
   * Afterwards, a permanent .disc is placed in the cell.
   */
  animateFall(targetRow, col, player) {
    return new Promise(resolve => {
      const topCell  = this.cells[0][col];
      const endCell  = this.cells[targetRow][col];
      const board    = this.$board;
      const cls      = player === 1 ? 'p1' : 'p2';

      const w     = topCell.offsetWidth;
      const h     = topCell.offsetHeight;
      const left  = topCell.offsetLeft;
      const startY = topCell.offsetTop - h * 2;  // above board → clipped
      const endY   = endCell.offsetTop;

      // Create flying disc
      const fly = document.createElement('div');
      fly.className = `fly-disc ${cls}`;
      Object.assign(fly.style, {
        width:  w + 'px',
        height: h + 'px',
        left:   left + 'px',
        top:    startY + 'px'
      });
      board.appendChild(fly);

      // Force reflow so browser registers the start position
      fly.getBoundingClientRect();

      // Duration scales with fall distance (longer drop = more time)
      const dur = 0.10 + targetRow * 0.048;
      fly.style.transition = `top ${dur}s cubic-bezier(0.25, 0, 0.72, 1.10)`;
      fly.style.top = endY + 'px';

      // Replace fly-disc with permanent disc after animation
      setTimeout(() => {
        fly.remove();
        const disc = document.createElement('div');
        disc.className = `disc ${cls}`;
        endCell.appendChild(disc);
        resolve();
      }, dur * 1000 + 60);
    });
  }

  /* ─── Win Highlight ─── */

  highlightWin(cells, player) {
    for (const [r, c] of cells) {
      const disc = this.cells[r][c].querySelector('.disc');
      if (disc) disc.classList.add('win');
    }
  }

  /* ─── UI State ─── */

  syncTurnUI() {
    const p   = this.game.currentPlayer;
    const cls = p === 1 ? 'p1' : 'p2';

    this.$turnChip.className = `turn-chip ${cls}`;
    this.$turnText.textContent = `Player ${p}'s Turn`;

    this.$cardP1.classList.toggle('active', p === 1);
    this.$cardP2.classList.toggle('active', p === 2);
  }

  updateScores() {
    this.$scoreP1.textContent = this.scores[0];
    this.$scoreP2.textContent = this.scores[1];
  }

  /* ─── Modal ─── */

  showModal(winner, isDraw) {
    if (isDraw) {
      this.$modalIcon.textContent = '🤝';
      this.$modalHead.textContent = "It's a Draw!";
      this.$modalMsg.textContent  = 'Perfectly matched — play again?';
    } else {
      this.$modalIcon.textContent = winner === 1 ? '🔴' : '🟡';
      this.$modalHead.textContent = `Player ${winner} Wins!`;
      const msgs = [
        'Outstanding play!', 'Absolutely brilliant!',
        'Unstoppable!', 'Well deserved!'
      ];
      this.$modalMsg.textContent = msgs[Math.floor(Math.random() * msgs.length)];
    }
    this.$modalBg.classList.add('open');
  }

  hideModal() {
    this.$modalBg.classList.remove('open');
  }

  /* ─── Game Control ─── */

  restartRound() {
    this.hideModal();
    this.game.reset();
    this.buildBoard();
    this.syncTurnUI();
    this.$preview.style.opacity = '0';
    this.busy = false;
  }

  newGame() {
    this.scores = [0, 0];
    this.updateScores();
    this.restartRound();
  }

  /* ─── Utility ─── */

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/* Boot when DOM is ready */
document.addEventListener('DOMContentLoaded', () => {
  window.game = new GameUI();
});
