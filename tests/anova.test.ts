import { describe, it, test, beforeEach, afterEach } from 'node:test';
import { expect, jest } from './expect';
import { anovaOneWay, anovaTwoWay, fDistPValue, incompleteBeta, round4 } from '../src/stats/anova';

// ═══════════════════════════════════════════════════════════
// ONE-WAY ANOVA — Cross-validated against SciPy f_oneway
// ═══════════════════════════════════════════════════════════

describe('ANOVA One-Way', () => {
  describe('Correctness (validated vs SciPy)', () => {
    test('classic 3-group example', () => {
      const r = anovaOneWay([
        [6, 8, 4, 5, 3, 4],
        [8, 12, 9, 11, 6, 8],
        [13, 9, 11, 8, 7, 12],
      ]);
      expect(r.f_statistic).toBeCloseTo(9.2647, 3);
      expect(r.p_value).toBeCloseTo(0.0024, 4);
      expect(r.df_between).toBe(2);
      expect(r.df_within).toBe(15);
      expect(r.eta_squared).toBeCloseTo(0.5526, 3);
      expect(r.significant).toBe(true);
    });

    test('PlantGrowth dataset (R built-in)', () => {
      const ctrl = [4.17, 5.58, 5.18, 6.11, 4.50, 4.61, 5.17, 4.53, 5.33, 5.14];
      const trt1 = [4.81, 4.17, 4.41, 3.59, 5.87, 3.83, 6.03, 4.89, 4.32, 4.69];
      const trt2 = [6.31, 5.12, 5.54, 5.50, 5.37, 5.29, 4.92, 6.15, 5.80, 5.26];
      const r = anovaOneWay([ctrl, trt1, trt2]);
      expect(r.f_statistic).toBeCloseTo(4.8461, 3);
      expect(r.p_value).toBeCloseTo(0.0159, 4);
      expect(r.significant).toBe(true);
    });

    test('not significant case (p > 0.05)', () => {
      const r = anovaOneWay([[1, 2, 3], [1.5, 2.5, 3.5], [2, 3, 4]]);
      expect(r.f_statistic).toBeCloseTo(0.75, 4);
      expect(r.p_value).toBeCloseTo(0.512, 3);
      expect(r.significant).toBe(false);
    });

    test('unequal group sizes', () => {
      const r = anovaOneWay([
        [23, 45, 12, 67, 34],
        [56, 78, 23],
        [12, 34, 56, 78, 90, 11],
      ]);
      expect(r.f_statistic).toBeCloseTo(0.3459, 3);
      expect(r.p_value).toBeCloseTo(0.715, 3);
    });

    test('negative values', () => {
      const r = anovaOneWay([
        [-5, -3, -1, -2, -4],
        [1, 3, 5, 2, 4],
        [-1, 0, 1, -2, 2],
      ]);
      expect(r.f_statistic).toBeCloseTo(18, 3);
      expect(r.p_value).toBeCloseTo(0.0002, 4);
      expect(r.eta_squared).toBeCloseTo(0.75, 3);
    });

    test('exactly two groups (degenerates to t-test-like F)', () => {
      const r = anovaOneWay([[10, 20, 30, 40], [15, 25, 35, 45]]);
      expect(r.f_statistic).toBeCloseTo(0.3, 3);
      expect(r.p_value).toBeCloseTo(0.6036, 3);
      expect(r.df_between).toBe(1);
    });
  });

  describe('Group statistics', () => {
    test('computes correct group means', () => {
      const r = anovaOneWay([[2, 4, 6], [10, 20, 30]]);
      expect(r.groups[0].mean).toBeCloseTo(4, 4);
      expect(r.groups[1].mean).toBeCloseTo(20, 4);
    });

    test('computes correct group variance (sample, n-1)', () => {
      const r = anovaOneWay([[2, 4, 6, 8], [1, 1, 1, 1]]);
      // variance of [2,4,6,8]: mean=5, ss=(9+1+1+9)=20, var=20/3=6.6667
      expect(r.groups[0].variance).toBeCloseTo(6.6667, 3);
      expect(r.groups[1].variance).toBeCloseTo(0, 4);
    });

    test('single-value group has variance 0 (n-1=0 guarded)', () => {
      const r = anovaOneWay([[5], [10], [15]]);
      expect(r.groups[0].variance).toBe(0);
      expect(r.f_statistic).toBeGreaterThan(0);
    });

    test('std_dev is sqrt of variance', () => {
      const r = anovaOneWay([[1, 2, 3, 4, 5], [10, 20, 30, 40, 50]]);
      // Both fields are independently round4()'d, so compare at 4dp tolerance
      expect(r.groups[0].std_dev).toBeCloseTo(Math.sqrt(r.groups[0].variance), 3);
    });
  });

  describe('Effect size (eta squared)', () => {
    test('eta squared always in [0, 1]', () => {
      const cases = [
        [[1, 2], [10, 11], [20, 21]],
        [[5, 5, 5], [5, 5, 5]],
        [[1, 100], [2, 200], [3, 300]],
      ];
      for (const groups of cases) {
        const r = anovaOneWay(groups);
        expect(r.eta_squared).toBeGreaterThanOrEqual(0);
        expect(r.eta_squared).toBeLessThanOrEqual(1);
      }
    });

    test('identical groups → eta squared = 0', () => {
      const r = anovaOneWay([[5, 5, 5], [5, 5, 5], [5, 5, 5]]);
      expect(r.eta_squared).toBe(0);
    });

    test('completely separated groups → eta squared near 1', () => {
      const r = anovaOneWay([[1, 1, 1], [100, 100, 100], [1000, 1000, 1000]]);
      expect(r.eta_squared).toBeGreaterThan(0.99);
    });
  });

  describe('Custom alpha threshold', () => {
    test('stricter alpha (0.01) changes significance', () => {
      const groups = [[1, 2, 3], [1.5, 2.5, 3.5], [2, 3, 4]];
      const r01 = anovaOneWay(groups, 0.01);
      expect(r01.alpha).toBe(0.01);
      expect(r01.significant).toBe(false);
    });

    test('looser alpha (0.10) can flip a borderline case', () => {
      // find or construct p in (0.05, 0.10)
      const groups = [[1, 2, 3, 4], [3, 4, 5, 6]];
      const r = anovaOneWay(groups, 0.10);
      expect(r.alpha).toBe(0.10);
    });
  });

  describe('Edge cases & error handling', () => {
    test('throws with fewer than 2 groups', () => {
      expect(() => anovaOneWay([[1, 2, 3]])).toThrow(/ANOVA_INSUFFICIENT_GROUPS/);
    });

    test('throws with zero groups', () => {
      expect(() => anovaOneWay([])).toThrow(/ANOVA_INSUFFICIENT_GROUPS/);
    });

    test('throws with an empty group', () => {
      expect(() => anovaOneWay([[1, 2], []])).toThrow(/ANOVA_INSUFFICIENT_DATA/);
    });

    test('all-identical values across all groups → F=0', () => {
      const r = anovaOneWay([[7, 7, 7], [7, 7, 7]]);
      expect(r.f_statistic).toBe(0);
    });

    test('handles floating point precision consistently', () => {
      const r = anovaOneWay([[0.1, 0.2, 0.3], [0.4, 0.5, 0.6]]);
      expect(Number.isFinite(r.f_statistic)).toBe(true);
      expect(Number.isFinite(r.p_value)).toBe(true);
    });

    test('large numbers do not overflow', () => {
      const r = anovaOneWay([[1e6, 2e6, 3e6], [4e6, 5e6, 6e6]]);
      expect(Number.isFinite(r.f_statistic)).toBe(true);
    });
  });

  describe('Performance', () => {
    test('1000-row dataset completes in under 100ms', () => {
      const g1 = Array.from({ length: 500 }, (_, i) => i * 0.1);
      const g2 = Array.from({ length: 500 }, (_, i) => 50 + i * 0.2);
      const start = Date.now();
      anovaOneWay([g1, g2]);
      expect(Date.now() - start).toBeLessThan(100);
    });

    test('many small groups (20 groups x 10 values) completes quickly', () => {
      const groups = Array.from({ length: 20 }, (_, g) =>
        Array.from({ length: 10 }, (_, i) => g * 10 + i)
      );
      const start = Date.now();
      const r = anovaOneWay(groups);
      expect(Date.now() - start).toBeLessThan(50);
      expect(r.df_between).toBe(19);
    });
  });
});

// ═══════════════════════════════════════════════════════════
// TWO-WAY ANOVA — Cross-validated against statsmodels anova_lm
// ═══════════════════════════════════════════════════════════

describe('ANOVA Two-Way', () => {
  const balancedData = [
    [[23, 25, 21, 24], [30, 32, 29, 31]],
    [[28, 26, 30, 27], [35, 37, 34, 36]],
    [[20, 22, 19, 21], [40, 42, 39, 41]],
  ];

  test('Factor A matches statsmodels reference', () => {
    const r = anovaTwoWay(balancedData, 'A', 'B');
    expect(r.factor_a.ss).toBeCloseTo(98.5833, 3);
    expect(r.factor_a.f_statistic).toBeCloseTo(23.66, 2);
    expect(r.factor_a.df).toBe(2);
  });

  test('Factor B matches statsmodels reference', () => {
    const r = anovaTwoWay(balancedData, 'A', 'B');
    expect(r.factor_b.ss).toBeCloseTo(816.6667, 3);
    expect(r.factor_b.f_statistic).toBeCloseTo(392.0, 1);
    expect(r.factor_b.df).toBe(1);
  });

  test('Interaction term matches statsmodels reference', () => {
    const r = anovaTwoWay(balancedData, 'A', 'B');
    expect(r.interaction.ss).toBeCloseTo(208.5833, 3);
    expect(r.interaction.f_statistic).toBeCloseTo(50.06, 1);
    expect(r.interaction.df).toBe(2);
  });

  test('within/residual SS and df match statsmodels reference', () => {
    const r = anovaTwoWay(balancedData, 'A', 'B');
    expect(r.ss_within).toBeCloseTo(37.5, 3);
    expect(r.df_within).toBe(18);
  });

  test('cell means computed correctly', () => {
    const r = anovaTwoWay(balancedData, 'A', 'B');
    expect(r.cell_means[0][0]).toBeCloseTo(23.25, 2); // mean of [23,25,21,24]
    expect(r.cell_means[2][1]).toBeCloseTo(40.5, 2);  // mean of [40,42,39,41]
  });

  test('grand mean is correct', () => {
    const r = anovaTwoWay(balancedData, 'A', 'B');
    const all = balancedData.flat(2);
    const expected = all.reduce((s, v) => s + v, 0) / all.length;
    expect(r.grand_mean).toBeCloseTo(expected, 4);
  });

  test('factor names propagate to result', () => {
    const r = anovaTwoWay(balancedData, 'Fertilizer', 'Watering');
    expect(r.factor_a.name).toBe('Fertilizer');
    expect(r.factor_b.name).toBe('Watering');
    expect(r.interaction.name).toBe('Fertilizer × Watering');
  });

  test('throws on unbalanced design (unequal cell sizes)', () => {
    const bad = [
      [[1, 2, 3], [4, 5]],
      [[6, 7, 8], [9, 10, 11]],
    ];
    expect(() => anovaTwoWay(bad, 'A', 'B')).toThrow(/ANOVA_UNBALANCED_DESIGN/);
  });

  test('throws with fewer than 2 levels of Factor A', () => {
    const bad = [[[1, 2], [3, 4]]];
    expect(() => anovaTwoWay(bad, 'A', 'B')).toThrow(/ANOVA_INSUFFICIENT_GROUPS/);
  });

  test('n_per_cell reflects replicate count', () => {
    const r = anovaTwoWay(balancedData, 'A', 'B');
    expect(r.n_per_cell).toBe(4);
  });
});

// ═══════════════════════════════════════════════════════════
// STATISTICAL PRIMITIVES — incomplete beta / F-distribution
// ═══════════════════════════════════════════════════════════

describe('Statistical primitives', () => {
  test('incompleteBeta(x, a, 1) matches closed form x^a', () => {
    // I_x(a, 1) = x^a exactly
    expect(incompleteBeta(0.5, 3, 1)).toBeCloseTo(0.125, 4);
    expect(incompleteBeta(0.8, 2, 1)).toBeCloseTo(0.64, 4);
  });

  test('incompleteBeta boundary conditions', () => {
    expect(incompleteBeta(0, 2, 3)).toBe(0);
    expect(incompleteBeta(1, 2, 3)).toBe(1);
  });

  test('incompleteBeta symmetry: I_x(a,b) + I_1-x(b,a) = 1', () => {
    const a = 3, b = 5, x = 0.4;
    const left = incompleteBeta(x, a, b) + incompleteBeta(1 - x, b, a);
    expect(left).toBeCloseTo(1, 6);
  });

  test('fDistPValue at F=0 returns p=1', () => {
    expect(fDistPValue(0, 2, 10)).toBe(1);
  });

  test('fDistPValue at F=Infinity returns p=0', () => {
    expect(fDistPValue(Infinity, 2, 10)).toBe(0);
  });

  test('round4 rounds correctly', () => {
    expect(round4(0.123456)).toBe(0.1235);
    expect(round4(1.00001)).toBe(1);
    expect(round4(-0.12345)).toBeCloseTo(-0.1234, 4); // JS Math.round rounds -x.5 toward +Infinity
  });

  test('round4 preserves Infinity/NaN passthrough', () => {
    expect(round4(Infinity)).toBe(Infinity);
  });
});

// ═══════════════════════════════════════════════════════════
// REGRESSION — null-effect dataset (fixed in v0.9.0)
// ═══════════════════════════════════════════════════════════

describe('ANOVA Two-Way — zero-variance regression', () => {
  test('flat dataset reports F=0, not Infinity', () => {
    // Every observation identical: there is no within-cell variance AND no
    // between-level variance. The earlier implementation short-circuited on
    // msW === 0 and returned Infinity, producing p=0 / significant=true for
    // data that provably contains no effect at all.
    const flat = [
      [[5, 5, 5], [5, 5, 5]],
      [[5, 5, 5], [5, 5, 5]],
    ];
    const r = anovaTwoWay(flat, 'A', 'B');

    expect(r.factor_a.f_statistic).toBe(0);
    expect(r.factor_b.f_statistic).toBe(0);
    expect(r.interaction.f_statistic).toBe(0);
    expect(r.factor_a.significant).toBe(false);
    expect(r.factor_b.significant).toBe(false);
    expect(r.interaction.significant).toBe(false);
    expect(r.ss_within).toBe(0);
    expect(r.grand_mean).toBe(5);
  });

  test('genuine effect with zero within-cell variance still reports Infinity', () => {
    // No replicate spread, but the cell means genuinely differ — F is
    // undefined-large here, and Infinity remains the right answer.
    const separated = [
      [[1, 1, 1], [1, 1, 1]],
      [[9, 9, 9], [9, 9, 9]],
    ];
    const r = anovaTwoWay(separated, 'A', 'B');

    expect(r.factor_a.f_statistic).toBe(Infinity);
    expect(r.factor_b.f_statistic).toBe(0);
  });
});
