/** Tiny dense linear algebra for regime-wise ridge weights. */

export function ridge(X: number[][], y: number[], lambda: number): number[] {
  const n = X.length;
  const k = X[0]?.length ?? 0;
  if (n === 0 || k === 0) return [];
  const xtx: number[][] = Array.from({ length: k }, () => Array(k).fill(0));
  const xty: number[] = Array(k).fill(0);
  for (let i = 0; i < n; i++) {
    const row = X[i];
    const yi = y[i];
    for (let a = 0; a < k; a++) {
      xty[a] += row[a] * yi;
      for (let b = 0; b < k; b++) xtx[a][b] += row[a] * row[b];
    }
  }
  for (let a = 0; a < k; a++) xtx[a][a] += lambda;
  return solve(xtx, xty);
}

function solve(A0: number[][], b0: number[]): number[] {
  const n = b0.length;
  const A = A0.map((row) => row.slice());
  const b = b0.slice();
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(A[r][col]) > Math.abs(A[piv][col])) piv = r;
    if (Math.abs(A[piv][col]) < 1e-12) {
      A[col][col] = 1e-6;
      piv = col;
    }
    if (piv !== col) {
      [A[col], A[piv]] = [A[piv], A[col]];
      [b[col], b[piv]] = [b[piv], b[col]];
    }
    const div = A[col][col];
    for (let j = col; j < n; j++) A[col][j] /= div;
    b[col] /= div;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = A[r][col];
      for (let j = col; j < n; j++) A[r][j] -= f * A[col][j];
      b[r] -= f * b[col];
    }
  }
  return b;
}

export function l1Normalize(w: number[]): number[] {
  const s = w.reduce((a, b) => a + Math.abs(b), 0);
  if (s < 1e-12) return w.map(() => 0);
  return w.map((x) => x / s);
}
