"""
Generate ground-truth two-way ANOVA results via statsmodels' anova_lm,
for cross-validating the PHP/Go/Rust two-way ports against.

Each dataset is a balanced a x b x n design (equal replicates per cell).
"""
import json
import numpy as np
import pandas as pd
import statsmodels.api as sm
from statsmodels.formula.api import ols

datasets = []

def run_case(name, data, factor_a_name='A', factor_b_name='B', alpha=0.05):
    """data: nested list [a][b][n] of replicate values."""
    rows = []
    for i, row in enumerate(data):
        for j, cell in enumerate(row):
            for v in cell:
                rows.append({'A': f'a{i}', 'B': f'b{j}', 'y': v})
    df = pd.DataFrame(rows)

    model = ols('y ~ C(A) * C(B)', data=df).fit()
    table = sm.stats.anova_lm(model, typ=2)

    def row_of(label):
        r = table.loc[label]
        return {
            'ss': round(float(r['sum_sq']), 4),
            'df': int(r['df']),
            'f_statistic': round(float(r['F']), 4) if not pd.isna(r['F']) else None,
            'p_value': round(float(r['PR(>F)']), 4) if not pd.isna(r['PR(>F)']) else None,
        }

    result = {
        'name': name,
        'data': data,
        'factor_a_name': factor_a_name,
        'factor_b_name': factor_b_name,
        'alpha': alpha,
        'factor_a': row_of('C(A)'),
        'factor_b': row_of('C(B)'),
        'interaction': row_of('C(A):C(B)'),
        'residual': row_of('Residual'),
        'grand_mean': round(float(df['y'].mean()), 4),
    }
    datasets.append(result)
    print(f"{name}: A F={result['factor_a']['f_statistic']} p={result['factor_a']['p_value']} | "
          f"B F={result['factor_b']['f_statistic']} p={result['factor_b']['p_value']} | "
          f"AxB F={result['interaction']['f_statistic']} p={result['interaction']['p_value']}")


# Case 1: classic textbook 2x2, 3 reps/cell, clear main effects, no interaction
run_case('classic_2x2_no_interaction', [
    [[10, 12, 11], [20, 22, 21]],
    [[15, 17, 16], [25, 27, 26]],
], 'Diet', 'Exercise')

# Case 2: 3x2 with a real interaction effect (crossover pattern)
run_case('3x2_with_interaction', [
    [[5, 6, 7], [15, 16, 17]],
    [[10, 11, 12], [10, 11, 12]],
    [[15, 16, 17], [5, 6, 7]],
], 'Dose', 'Formulation')

# Case 3: 2x3, 4 reps/cell, larger balanced design
run_case('2x3_four_reps', [
    [[1, 2, 3, 4], [5, 6, 7, 8], [9, 10, 11, 12]],
    [[2, 3, 4, 5], [6, 7, 8, 9], [10, 11, 12, 13]],
], 'Group', 'Time')

# Case 4: negative values
run_case('negative_values', [
    [[-5, -3, -4], [1, 3, 2]],
    [[-1, 0, -2], [5, 7, 6]],
], 'Treatment', 'Region')

# Case 5: near-null effects with tiny real variance (statsmodels-safe — a
# TRULY flat/identical dataset produces 0/0 floating-point noise in OLS
# that isn't reliable ground truth; each language's port tests that exact
# degenerate case as an internal unit test instead, asserting F=0/p=1
# directly, not against statsmodels).
run_case('near_null_tiny_variance', [
    [[5.0, 5.001, 4.999], [5.0, 5.001, 4.999]],
    [[5.0, 5.001, 4.999], [5.0, 5.001, 4.999]],
], 'X', 'Y')

# Case 6: single replicate per cell (n=1) -> valid but no ability to estimate
# pure error separately from... actually still fine for balanced 2-way with interaction
# as long as a,b >= 2. Use n=2 minimum here since n=1 leaves dfW=0 (can't compute MSW).
run_case('2x2_two_reps', [
    [[3.0, 4.0], [8.0, 9.0]],
    [[6.0, 7.0], [12.0, 13.0]],
], 'FactorA', 'FactorB')

with open('/home/claude/anova_twoway/reference/reference_twoway.json', 'w') as f:
    json.dump(datasets, f, indent=2)

print(f"\nWrote {len(datasets)} datasets to reference_twoway.json")
