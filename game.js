'use strict';

/**
 * ConnectFour — pure game logic, no DOM.
 * board[row][col]: 0 = empty | 1 = Player 1 | 2 = Player 2
 * Row 0 is the TOP row, Row 5 is the BOTTOM row.
 */
class ConnectFour {
  constructor() {
    this.ROWS = 6;
    this.COLS = 7;
    this.reset();
  }

  /** Reset everything to starting state */
  reset() {
    this.board = Array.from({ length: this.ROWS }, () =>
      new Array(this.COLS).fill(0)
    );
    this.currentPlayer = 1;
    this.gameOver      = false;
    this.winner        = null;
    this.winCells      = [];   // Array of [row, col] pairs forming the winning line
    this.moves         = 0;
  }

  /** Lowest empty row in a column; -1 if full */
  lowestRow(col) {
    for (let r = this.ROWS - 1; r >= 0; r--) {
      if (this.board[r][col] === 0) return r;
    }
    return -1;
  }

  /** True if a disc can be dropped into col */
  canDrop(col) {
    return (
      !this.gameOver &&
      col >= 0 &&
      col < this.COLS &&
      this.lowestRow(col) !== -1
    );
  }

  /**
   * Drop current player's disc into col.
   * Returns { row, col, player, win?, draw? } or null on invalid move.
   */
  drop(col) {
    if (!this.canDrop(col)) return null;

    const row    = this.lowestRow(col);
    const player = this.currentPlayer;

    this.board[row][col] = player;
    this.moves++;

    // Check for win
    const win = this.findWin(row, col, player);
    if (win) {
      this.gameOver = true;
      this.winner   = player;
      this.winCells = win;
      return { row, col, player, win: true };
    }

    // Check for draw
    if (this.moves === this.ROWS * this.COLS) {
      this.gameOver = true;
      return { row, col, player, draw: true };
    }

    // Switch player
    this.currentPlayer = player === 1 ? 2 : 1;
    return { row, col, player };
  }

  /**
   * Returns the winning cell array [row, col][] if player has 4 in a row
   * starting from (row, col), or null.
   */
  findWin(row, col, player) {
    // Check all 4 directions: →, ↓, ↘, ↙
    const directions = [[0, 1], [1, 0], [1, 1], [1, -1]];

    for (const [dr, dc] of directions) {
      const cells = this.streak(row, col, dr, dc, player);
      if (cells.length >= 4) return cells;
    }
    return null;
  }

  /** Collect all cells with 'player' along direction ±(dr,dc) from (row,col) */
  streak(row, col, dr, dc, player) {
    const cells = [[row, col]];

    for (const sign of [-1, 1]) {
      let r = row + dr * sign;
      let c = col + dc * sign;
      while (
        r >= 0 && r < this.ROWS &&
        c >= 0 && c < this.COLS &&
        this.board[r][c] === player
      ) {
        cells.push([r, c]);
        r += dr * sign;
        c += dc * sign;
      }
    }
    return cells;
  }
}
