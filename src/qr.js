// A QR code for a URL, as a grid of dark/light modules — for the printed table
// tent (src/tent.jsx). Written here rather than pulled in: the project ships no
// dependencies beyond React. Byte mode, error correction M (15%, the usual choice
// for print), versions 1–9: up to 180 bytes, more than any listing link needs.
// ISO/IEC 18004; unit-tested in qr.test.js, and the tent's codes are scan-checked.

// Per version at level M: [error-correction codewords per block, [blocks, data codewords]...]
const BLOCKS = [
  null,
  [10, [1, 16]],
  [16, [1, 28]],
  [26, [1, 44]],
  [18, [2, 32]],
  [24, [2, 43]],
  [16, [4, 27]],
  [18, [4, 31]],
  [22, [2, 38], [2, 39]],
  [22, [3, 36], [2, 37]],
];
const ALIGN = [null, [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46]];

// GF(256) arithmetic over x^8 + x^4 + x^3 + x^2 + 1
function gfMul(a, b) {
  let r = 0;
  for (; b > 0; b >>= 1) {
    if (b & 1) r ^= a;
    a <<= 1;
    if (a & 0x100) a ^= 0x11d;
  }
  return r;
}

// Reed–Solomon error-correction codewords for one block
export function rsRemainder(data, count) {
  const gen = [1]; // the generator polynomial, highest power first
  let root = 1;
  for (let i = 0; i < count; i++) {
    gen.push(0);
    for (let j = gen.length - 1; j > 0; j--) gen[j] = gen[j] ^ gfMul(gen[j - 1], root);
    root = gfMul(root, 2);
  }
  const rem = new Array(count).fill(0);
  for (const byte of data) {
    const factor = byte ^ rem.shift();
    rem.push(0);
    for (let i = 0; i < count; i++) rem[i] ^= gfMul(gen[i + 1], factor);
  }
  return rem;
}

// BCH remainder for the format (generator 0x537) and version (0x1f25) fields
function bch(value, generator, bits) {
  let r = value << bits;
  for (let i = Math.floor(Math.log2(r)); i >= bits; i--) if ((r >> i) & 1) r ^= generator << (i - bits);
  return (value << bits) | r;
}
// Level M's two bits are 00, so the field is just the mask number
export const formatBits = (mask) => bch(mask, 0x537, 10) ^ 0x5412;

const MASKS = [
  (x, y) => (x + y) % 2 === 0,
  (x, y) => y % 2 === 0,
  (x) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];

// Fewer long runs, 2x2 blocks and lopsided dark/light is easier on a scanner
function penalty(grid) {
  const n = grid.length;
  let score = 0;
  for (const line of [grid, grid.map((_, x) => grid.map((row) => row[x]))]) {
    for (const row of line) {
      let run = 1;
      for (let i = 1; i <= n; i++) {
        if (i < n && row[i] === row[i - 1]) run++;
        else {
          if (run >= 5) score += run - 2;
          run = 1;
        }
      }
    }
  }
  let dark = 0;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (grid[y][x]) dark++;
      if (x < n - 1 && y < n - 1 && grid[y][x] === grid[y][x + 1] && grid[y][x] === grid[y + 1][x] && grid[y][x] === grid[y + 1][x + 1]) score += 3;
    }
  }
  return score + Math.floor(Math.abs((dark * 20) / (n * n) - 10)) * 10;
}

// text → rows of booleans (true = dark), no quiet zone: leave four modules of
// white around it when drawing
export function qrModules(text) {
  const bytes = [...new TextEncoder().encode(text)];
  const version = BLOCKS.findIndex((b) => b && b.slice(1).reduce((n, [count, size]) => n + count * size, 0) - 2 >= bytes.length);
  if (version < 1) throw new Error(`qr: ${bytes.length} bytes is too long for a version 9-M code (180)`);
  const [ecLen, ...groups] = BLOCKS[version];
  const dataLen = groups.reduce((n, [count, size]) => n + count * size, 0);

  // Data codewords: mode 0100, an 8-bit length, the bytes, a terminator, then pads
  const bits = [0, 1, 0, 0];
  const push = (value, width) => { for (let i = width - 1; i >= 0; i--) bits.push((value >> i) & 1); };
  push(bytes.length, 8);
  bytes.forEach((b) => push(b, 8));
  push(0, Math.min(4, dataLen * 8 - bits.length));
  while (bits.length % 8) bits.push(0);
  const data = [];
  for (let i = 0; i < bits.length; i += 8) data.push(parseInt(bits.slice(i, i + 8).join(''), 2));
  for (let pad = 0xec; data.length < dataLen; pad ^= 0xec ^ 0x11) data.push(pad);

  // Split into blocks, add error correction, interleave
  const blocks = [];
  let at = 0;
  for (const [count, size] of groups) {
    for (let i = 0; i < count; i++) {
      const d = data.slice(at, (at += size));
      blocks.push({ d, e: rsRemainder(d, ecLen) });
    }
  }
  const stream = [];
  for (let i = 0; i < Math.max(...blocks.map((b) => b.d.length)); i++) blocks.forEach((b) => i < b.d.length && stream.push(b.d[i]));
  for (let i = 0; i < ecLen; i++) blocks.forEach((b) => stream.push(b.e[i]));

  // The function patterns: finders, timing, alignment, and the reserved fields
  const n = version * 4 + 17;
  const grid = Array.from({ length: n }, () => new Array(n).fill(false));
  const fixed = Array.from({ length: n }, () => new Array(n).fill(false));
  const set = (x, y, dark) => { if (x >= 0 && x < n && y >= 0 && y < n) { grid[y][x] = dark; fixed[y][x] = true; } };
  for (let i = 0; i < n; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
  for (const [cx, cy] of [[3, 3], [n - 4, 3], [3, n - 4]]) {
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const ring = Math.max(Math.abs(dx), Math.abs(dy));
      set(cx + dx, cy + dy, ring !== 2 && ring !== 4);
    }
  }
  const centers = ALIGN[version];
  for (const cx of centers) for (const cy of centers) {
    const last = centers.length - 1;
    if ((cx === 6 && cy === 6) || (cx === 6 && cy === centers[last]) || (cx === centers[last] && cy === 6)) continue; // a finder is there
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  }
  const drawFormat = (mask) => {
    const f = formatBits(mask);
    const bit = (i) => ((f >> i) & 1) === 1;
    for (let i = 0; i <= 5; i++) set(8, i, bit(i));
    set(8, 7, bit(6)); set(8, 8, bit(7)); set(7, 8, bit(8));
    for (let i = 9; i < 15; i++) set(14 - i, 8, bit(i));
    for (let i = 0; i < 8; i++) set(n - 1 - i, 8, bit(i));
    for (let i = 8; i < 15; i++) set(8, n - 15 + i, bit(i));
    set(8, n - 8, true);
  };
  drawFormat(0); // reserves the cells; the real bits go in with the chosen mask
  if (version >= 7) {
    const v = bch(version, 0x1f25, 12);
    for (let i = 0; i < 18; i++) {
      const [a, b] = [n - 11 + (i % 3), Math.floor(i / 3)];
      set(a, b, ((v >> i) & 1) === 1); set(b, a, ((v >> i) & 1) === 1);
    }
  }

  // The codewords, zigzagging up and down two-module columns from the bottom right
  let i = 0;
  for (let right = n - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let v = 0; v < n; v++) for (let j = 0; j < 2; j++) {
      const x = right - j;
      const y = ((right + 1) & 2) === 0 ? n - 1 - v : v;
      if (fixed[y][x]) continue;
      grid[y][x] = i < stream.length * 8 && ((stream[i >> 3] >> (7 - (i & 7))) & 1) === 1;
      i++;
    }
  }

  // Try every mask; keep the one a scanner will find easiest
  let best = null;
  for (let mask = 0; mask < 8; mask++) {
    const g = grid.map((row, y) => row.map((dark, x) => (fixed[y][x] ? dark : dark !== MASKS[mask](x, y))));
    const keep = grid.map((row) => [...row]);
    drawFormat(mask);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (fixed[y][x]) g[y][x] = grid[y][x];
    for (let y = 0; y < n; y++) grid[y] = keep[y]; // drawFormat wrote into grid; put it back
    const score = penalty(g);
    if (!best || score < best.score) best = { g, score };
  }
  return best.g;
}
