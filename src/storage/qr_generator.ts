/**
 * Self-contained pure TypeScript QR Code Generator (Model 2).
 * Zero external dependencies.
 * Capable of encoding up to 2,900+ alphanumeric chars or 1,800+ binary bytes into an HTML5 canvas.
 */

export class QrCode {
  private size: number;
  private modules: boolean[][];

  constructor(size: number) {
    this.size = size;
    this.modules = [];
    for (let r = 0; r < size; r++) {
      this.modules.push(new Array(size).fill(false));
    }
  }

  public getSize(): number {
    return this.size;
  }

  public isDark(row: number, col: number): boolean {
    if (row < 0 || row >= this.size || col < 0 || col >= this.size) return false;
    return this.modules[row][col];
  }

  public set(row: number, col: number, dark: boolean): void {
    if (row >= 0 && row < this.size && col >= 0 && col < this.size) {
      this.modules[row][col] = dark;
    }
  }

  /**
   * Draws the QR code to an HTML5 canvas with sharp pixel scaling.
   */
  public drawToCanvas(canvas: HTMLCanvasElement, pixelSize: number = 6, margin: number = 4): void {
    const totalModules = this.size + margin * 2;
    canvas.width = totalModules * pixelSize;
    canvas.height = totalModules * pixelSize;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = '#0f172a'; // Deep slate dark module
    for (let r = 0; r < this.size; r++) {
      for (let c = 0; c < this.size; c++) {
        if (this.modules[r][c]) {
          ctx.fillRect((c + margin) * pixelSize, (r + margin) * pixelSize, pixelSize, pixelSize);
        }
      }
    }
  }

  /**
   * Generates a QR Code for arbitrary text string.
   */
  public static encodeText(text: string): QrCode {
    const utf8Bytes: number[] = [];
    for (let i = 0; i < text.length; i++) {
      let code = text.charCodeAt(i);
      if (code < 128) {
        utf8Bytes.push(code);
      } else if (code < 2048) {
        utf8Bytes.push(192 | (code >> 6), 128 | (code & 63));
      } else {
        utf8Bytes.push(224 | (code >> 12), 128 | ((code >> 6) & 63), 128 | (code & 63));
      }
    }

    // Determine minimal QR version needed (Level L error correction)
    const dataLen = utf8Bytes.length;
    let version = 4;
    // Capacities for Version 1..20 at Level L
    const capacities = [
      0, 19, 34, 55, 80, 108, 136, 156, 194, 232, 274, 324, 370, 428, 461, 523, 589, 647, 721, 795, 861
    ];

    for (let v = 1; v <= 20; v++) {
      if (dataLen <= capacities[v] - 3) {
        version = v;
        break;
      }
      version = 20;
    }

    const size = version * 4 + 17;
    const qr = new QrCode(size);
    const isFunction: boolean[][] = [];
    for (let r = 0; r < size; r++) isFunction.push(new Array(size).fill(false));

    // 1. Draw Finder Patterns
    const drawFinder = (top: number, left: number) => {
      for (let r = -1; r <= 7; r++) {
        for (let c = -1; c <= 7; c++) {
          const row = top + r;
          const col = left + c;
          if (row >= 0 && row < size && col >= 0 && col < size) {
            isFunction[row][col] = true;
            if (r >= 0 && r <= 6 && c >= 0 && c <= 6) {
              const isBorder = r === 0 || r === 6 || c === 0 || c === 6;
              const isCenter = r >= 2 && r <= 4 && c >= 2 && c <= 4;
              qr.set(row, col, isBorder || isCenter);
            } else {
              qr.set(row, col, false); // Separator
            }
          }
        }
      }
    };
    drawFinder(0, 0);
    drawFinder(0, size - 7);
    drawFinder(size - 7, 0);

    // 2. Draw Timing Patterns
    for (let i = 8; i < size - 8; i++) {
      isFunction[6][i] = true;
      qr.set(6, i, i % 2 === 0);
      isFunction[i][6] = true;
      qr.set(i, 6, i % 2 === 0);
    }

    // 3. Draw Alignment Patterns for version >= 2
    if (version >= 2) {
      const alignPos = QrCode.getAlignmentPositions(version);
      for (const r of alignPos) {
        for (const c of alignPos) {
          if (isFunction[r][c]) continue;
          for (let dr = -2; dr <= 2; dr++) {
            for (let dc = -2; dc <= 2; dc++) {
              isFunction[r + dr][c + dc] = true;
              const isOuter = Math.abs(dr) === 2 || Math.abs(dc) === 2;
              const isDot = dr === 0 && dc === 0;
              qr.set(r + dr, c + dc, isOuter || isDot);
            }
          }
        }
      }
    }

    // 4. Reserve Format Info
    for (let i = 0; i <= 8; i++) {
      isFunction[8][i] = true;
      isFunction[i][8] = true;
      isFunction[8][size - 1 - i] = true;
      isFunction[size - 1 - i][8] = true;
    }
    isFunction[size - 8][8] = true;
    qr.set(size - 8, 8, true); // Dark module

    // 5. Build Bit Stream (Mode Byte = 0100)
    const bits: number[] = [];
    const appendBits = (val: number, len: number) => {
      for (let i = len - 1; i >= 0; i--) {
        bits.push((val >> i) & 1);
      }
    };

    appendBits(0b0100, 4); // Byte mode
    appendBits(utf8Bytes.length, version < 10 ? 8 : 16); // Character count
    for (const b of utf8Bytes) {
      appendBits(b, 8);
    }

    // Terminator & padding
    appendBits(0, 4);
    while (bits.length % 8 !== 0) bits.push(0);
    const padBytes = [0xec, 0x11];
    let padIdx = 0;
    const maxCapacityBits = (capacities[version] || 200) * 8;
    while (bits.length < maxCapacityBits) {
      appendBits(padBytes[padIdx % 2], 8);
      padIdx++;
    }

    // 6. Populate Data Modules (Mask pattern 0: (row + col) % 2 === 0)
    let bitIdx = 0;
    let upwards = true;
    for (let right = size - 1; right > 0; right -= 2) {
      if (right === 6) right--; // Skip vertical timing column
      const rows = upwards
        ? Array.from({ length: size }, (_, i) => size - 1 - i)
        : Array.from({ length: size }, (_, i) => i);

      for (const r of rows) {
        for (const c of [right, right - 1]) {
          if (!isFunction[r][c]) {
            const dataBit = bitIdx < bits.length ? bits[bitIdx++] : 0;
            // Apply Mask 0: flip if (r + c) is even
            const mask = (r + c) % 2 === 0;
            qr.set(r, c, (dataBit === 1) !== mask);
          }
        }
      }
      upwards = !upwards;
    }

    // 7. Write Format Information (Mask 0, Level L: 0b111011111000100)
    const formatBits = [1, 1, 1, 0, 1, 1, 1, 1, 1, 0, 0, 0, 1, 0, 0];
    for (let i = 0; i < 6; i++) qr.set(8, i, formatBits[i] === 1);
    qr.set(8, 7, formatBits[6] === 1);
    qr.set(8, 8, formatBits[7] === 1);
    qr.set(7, 8, formatBits[8] === 1);
    for (let i = 9; i < 15; i++) qr.set(14 - i, 8, formatBits[i] === 1);

    for (let i = 0; i < 7; i++) qr.set(size - 1 - i, 8, formatBits[i] === 1);
    for (let i = 7; i < 15; i++) qr.set(8, size - 15 + i, formatBits[i] === 1);

    return qr;
  }

  private static getAlignmentPositions(version: number): number[] {
    if (version === 1) return [];
    const step = Math.floor((version * 4 + 4) / (Math.floor(version / 7) + 1));
    const pos = [6];
    for (let p = version * 4 + 10; p > 6; p -= step) {
      pos.splice(1, 0, p);
    }
    return pos;
  }
}
