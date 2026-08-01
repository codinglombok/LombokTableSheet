/**
 * LombokTableSheet — ANOVA Module
 * One-way & Two-way ANOVA with mathematical rigor.
 * Validated against R / SciPy / Excel to 4 decimal places.
 *
 * @module formulas/anova
 */

// ═══════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════

export interface AnovaGroupStats {
  n: number;
  mean: number;
  variance: number;
  std_dev: number;
}

export interface AnovaOneWayResult {
  f_statistic: number;
  p_value: number;
  df_between: number;
  df_within: number;
  ss_between: number;
  ss_within: number;
  ss_total: number;
  ms_between: number;
  ms_within: number;
  eta_squared: number;
  significant: boolean;
  alpha: number;
  groups: AnovaGroupStats[];
}

export interface AnovaTwoWayResult {
  factor_a: AnovaFactorResult;
  factor_b: AnovaFactorResult;
  interaction: AnovaFactorResult;
  ss_within: number;
  df_within: number;
  ms_within: number;
  ss_total: number;
  grand_mean: number;
  cell_means: number[][];   // [levelA][levelB] -> mean
  n_per_cell: number;
}

export interface AnovaFactorResult {
  name: string;
  ss: number;
  df: number;
  ms: number;
  f_statistic: number;
  p_value: number;
  significant: boolean;
  eta_squared: number;
}

// ═══════════════════════════════════════════════════════════
// ONE-WAY ANOVA
// ═══════════════════════════════════════════════════════════

export function anovaOneWay(groups: number[][], alpha = 0.05): AnovaOneWayResult {
  if (groups.length < 2) {
    throw new Error('ANOVA_INSUFFICIENT_GROUPS: requires at least 2 groups, got ' + groups.length);
  }
  if (groups.some(g => g.length < 1)) {
    throw new Error('ANOVA_INSUFFICIENT_DATA: each group needs at least 1 value');
  }

  const k = groups.length;
  const N = groups.reduce((s, g) => s + g.length, 0);

  const groupStats: AnovaGroupStats[] = groups.map(g => {
    const n = g.length;
    const mean = sum(g) / n;
    const variance = n > 1 ? g.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1) : 0;
    return { n, mean, variance, std_dev: Math.sqrt(variance) };
  });

  const grandMean = sum(groups.flat()) / N;

  const ssb = groupStats.reduce((s, gs) => s + gs.n * (gs.mean - grandMean) ** 2, 0);
  const dfb = k - 1;
  const msb = ssb / dfb;

  const ssw = groups.reduce((s, g, i) => {
    // groupStats is built by mapping over `groups`, so index i always exists;
    // the fallback exists only to satisfy noUncheckedIndexedAccess.
    const groupMean = groupStats[i]?.mean ?? 0;
    return s + g.reduce((ss, v) => ss + (v - groupMean) ** 2, 0);
  }, 0);
  const dfw = N - k;
  const msw = dfw > 0 ? ssw / dfw : 0;

  const sst = ssb + ssw;
  const f = msw === 0 ? (msb === 0 ? 0 : Infinity) : msb / msw;
  const p = fDistPValue(f, dfb, dfw);
  const eta2 = sst === 0 ? 0 : ssb / sst;

  return {
    f_statistic: round4(f),
    p_value: round4(p),
    df_between: dfb,
    df_within: dfw,
    ss_between: round4(ssb),
    ss_within: round4(ssw),
    ss_total: round4(sst),
    ms_between: round4(msb),
    ms_within: round4(msw),
    eta_squared: round4(eta2),
    significant: p < alpha,
    alpha,
    groups: groupStats.map(gs => ({
      n: gs.n,
      mean: round4(gs.mean),
      variance: round4(gs.variance),
      std_dev: round4(gs.std_dev),
    })),
  };
}

// ═══════════════════════════════════════════════════════════
// TWO-WAY ANOVA (balanced design, equal replication per cell)
// ═══════════════════════════════════════════════════════════

/**
 * data[i][j] = array of replicate values for factor A level i, factor B level j.
 * Requires a BALANCED design: same number of replicates (n) in every cell.
 */
export function anovaTwoWay(
  data: number[][][],
  factorAName = 'Factor A',
  factorBName = 'Factor B',
  alpha = 0.05
): AnovaTwoWayResult {
  const a = data.length;
  if (a < 2) throw new Error('ANOVA_INSUFFICIENT_GROUPS: Factor A needs at least 2 levels');
  const b = data[0]?.length ?? 0;
  if (b < 2) throw new Error('ANOVA_INSUFFICIENT_GROUPS: Factor B needs at least 2 levels');

  const n = data[0]?.[0]?.length ?? 0;
  if (n < 1) throw new Error('ANOVA_INSUFFICIENT_DATA: each cell needs at least 1 value');

  // Validate balanced design
  for (const row of data) {
    if (row.length !== b) throw new Error('ANOVA_UNBALANCED_DESIGN: all Factor A levels must have same number of Factor B levels');
    for (const cell of row) {
      if (cell.length !== n) throw new Error('ANOVA_UNBALANCED_DESIGN: two-way ANOVA requires equal replicates in every cell');
    }
  }

  const N = a * b * n;
  const allValues = data.flat(2);
  const grandMean = sum(allValues) / N;

  // Cell means
  const cellMeans: number[][] = data.map(row => row.map(cell => sum(cell) / n));

  // Row means (Factor A levels) — average over B and replicates
  const rowMeans: number[] = data.map(row => sum(row.flat()) / (b * n));

  // Column means (Factor B levels) — average over A and replicates
  const colMeans: number[] = [];
  for (let j = 0; j < b; j++) {
    let s = 0;
    for (const row of data) s += sum(row[j] ?? []);
    colMeans.push(s / (a * n));
  }

  // SS Factor A
  const ssA = rowMeans.reduce((s, m) => s + b * n * (m - grandMean) ** 2, 0);
  const dfA = a - 1;

  // SS Factor B
  const ssB = colMeans.reduce((s, m) => s + a * n * (m - grandMean) ** 2, 0);
  const dfB = b - 1;

  // SS Interaction (A×B)
  let ssAB = 0;
  for (let i = 0; i < a; i++) {
    const cellRow = cellMeans[i] ?? [];
    const rowMean = rowMeans[i] ?? 0;
    for (let j = 0; j < b; j++) {
      ssAB += n * ((cellRow[j] ?? 0) - rowMean - (colMeans[j] ?? 0) + grandMean) ** 2;
    }
  }
  const dfAB = dfA * dfB;

  // SS Within (error)
  let ssW = 0;
  for (let i = 0; i < a; i++) {
    const cellRow = cellMeans[i] ?? [];
    const dataRow = data[i] ?? [];
    for (let j = 0; j < b; j++) {
      const cellMean = cellRow[j] ?? 0;
      for (const v of (dataRow[j] ?? [])) ssW += (v - cellMean) ** 2;
    }
  }
  const dfW = a * b * (n - 1);

  const ssTotal = allValues.reduce((s, v) => s + (v - grandMean) ** 2, 0);

  const msA = ssA / dfA;
  const msB = ssB / dfB;
  const msAB = dfAB > 0 ? ssAB / dfAB : 0;
  const msW = dfW > 0 ? ssW / dfW : 0;

  // Mirrors one-way's explicit zero-handling: when there is NO within-cell
  // variance (msW === 0), a factor with likewise NO between-level variance
  // (msA/msB/msAB === 0) has F = 0 (no detectable effect), not Infinity.
  // BUG FIX (this session): the original code returned Infinity whenever
  // msW === 0 regardless of the numerator, so a completely flat dataset
  // (every value identical) was reported as F=Infinity, p=0, significant=true
  // — a false-positive "perfectly significant" result for data with
  // provably zero effect anywhere. Found by cross-validating against
  // statsmodels on a null-effect fixture and reasoning through the 0/0 case.
  const fA = msW === 0 ? (msA === 0 ? 0 : Infinity) : msA / msW;
  const fB = msW === 0 ? (msB === 0 ? 0 : Infinity) : msB / msW;
  const fAB = msW === 0 ? (msAB === 0 ? 0 : Infinity) : msAB / msW;

  const pA = fDistPValue(fA, dfA, dfW);
  const pB = fDistPValue(fB, dfB, dfW);
  const pAB = fDistPValue(fAB, dfAB, dfW);

  const mkFactor = (name: string, ss: number, df: number, ms: number, f: number, p: number): AnovaFactorResult => ({
    name,
    ss: round4(ss),
    df,
    ms: round4(ms),
    f_statistic: round4(f),
    p_value: round4(p),
    significant: p < alpha,
    eta_squared: ssTotal === 0 ? 0 : round4(ss / ssTotal),
  });

  return {
    factor_a: mkFactor(factorAName, ssA, dfA, msA, fA, pA),
    factor_b: mkFactor(factorBName, ssB, dfB, msB, fB, pB),
    interaction: mkFactor(`${factorAName} × ${factorBName}`, ssAB, dfAB, msAB, fAB, pAB),
    ss_within: round4(ssW),
    df_within: dfW,
    ms_within: round4(msW),
    ss_total: round4(ssTotal),
    grand_mean: round4(grandMean),
    cell_means: cellMeans.map(row => row.map(round4)),
    n_per_cell: n,
  };
}

// ═══════════════════════════════════════════════════════════
// STATISTICAL HELPERS
// ═══════════════════════════════════════════════════════════

function sum(arr: number[]): number {
  return arr.reduce((s, v) => s + v, 0);
}

export function round4(x: number): number {
  if (!isFinite(x)) return x;
  return Math.round(x * 10000) / 10000;
}

/**
 * P-value from the F-distribution: P(F_{d1,d2} > f)
 * = regularized incomplete beta I_x(d2/2, d1/2), x = d2/(d2 + d1*f)
 */
export function fDistPValue(f: number, d1: number, d2: number): number {
  if (!isFinite(f)) return 0;
  if (f <= 0) return 1;
  const x = d2 / (d2 + d1 * f);
  return incompleteBeta(x, d2 / 2, d1 / 2);
}

/**
 * Regularized incomplete beta function I_x(a, b) via Lentz continued fraction.
 * Standard numerical recipe (Numerical Recipes in C, §6.4).
 */
export function incompleteBeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;

  const lbeta = logGamma(a) + logGamma(b) - logGamma(a + b);
  const front = Math.exp(Math.log(x) * a + Math.log(1 - x) * b - lbeta);

  if (x < (a + 1) / (a + b + 2)) {
    return (front / a) * betaContinuedFraction(x, a, b);
  } else {
    return 1 - (front / b) * betaContinuedFraction(1 - x, b, a);
  }
}

function betaContinuedFraction(x: number, a: number, b: number): number {
  const MAX_ITER = 300;
  const EPS = 1e-12;
  const FPMIN = 1e-300;

  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;

  for (let m = 1; m <= MAX_ITER; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;  if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    h *= d * c;

    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;  if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;

    if (Math.abs(del - 1) < EPS) break;
  }
  return h;
}

/** Lanczos approximation for log-gamma (high precision, g=7, n=9) */
export function logGamma(x: number): number {
  const g = 7;
  const C = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028,
    771.32342877765313, -176.61502916214059, 12.507343278686905,
    -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ];

  if (x < 0.5) {
    return Math.log(Math.PI / Math.sin(Math.PI * x)) - logGamma(1 - x);
  }

  x -= 1;
  let a = C[0] ?? 0;
  const t = x + g + 0.5;
  for (let i = 1; i < g + 2; i++) a += (C[i] ?? 0) / (x + i);

  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}
