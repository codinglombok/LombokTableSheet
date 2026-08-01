"""
Cross-validation reference generator for ANOVA implementation.
Generates expected outputs from SciPy (one-way) and manual two-way computation,
outputs JSON for the Node.js test harness to compare against.
"""
import json
import numpy as np
from scipy import stats

datasets_oneway = {
    "classic_3group": {
        "groups": [
            [6, 8, 4, 5, 3, 4],
            [8, 12, 9, 11, 6, 8],
            [13, 9, 11, 8, 7, 12],
        ]
    },
    "not_significant": {
        "groups": [
            [1, 2, 3],
            [1.5, 2.5, 3.5],
            [2, 3, 4],
        ]
    },
    "equal_groups": {
        "groups": [
            [5, 5, 5],
            [5, 5, 5],
        ]
    },
    "plant_growth": {
        # R's built-in PlantGrowth dataset
        "groups": [
            [4.17, 5.58, 5.18, 6.11, 4.50, 4.61, 5.17, 4.53, 5.33, 5.14],
            [4.81, 4.17, 4.41, 3.59, 5.87, 3.83, 6.03, 4.89, 4.32, 4.69],
            [6.31, 5.12, 5.54, 5.50, 5.37, 5.29, 4.92, 6.15, 5.80, 5.26],
        ]
    },
    "unequal_n": {
        "groups": [
            [23, 45, 12, 67, 34],
            [56, 78, 23],
            [12, 34, 56, 78, 90, 11],
        ]
    },
    "two_groups_only": {
        "groups": [
            [10, 20, 30, 40],
            [15, 25, 35, 45],
        ]
    },
    "negative_values": {
        "groups": [
            [-5, -3, -1, -2, -4],
            [1, 3, 5, 2, 4],
            [-1, 0, 1, -2, 2],
        ]
    },
    "large_dataset": {
        "groups": [
            list(np.linspace(0, 50, 500)),
            list(np.linspace(50, 100, 500)),
        ]
    },
}

results = {}
for name, d in datasets_oneway.items():
    groups = d["groups"]
    f, p = stats.f_oneway(*groups)
    # eta squared
    grand_mean = np.mean(np.concatenate(groups))
    ssb = sum(len(g) * (np.mean(g) - grand_mean) ** 2 for g in groups)
    ssw = sum(sum((np.array(g) - np.mean(g)) ** 2) for g in groups)
    eta2 = ssb / (ssb + ssw) if (ssb + ssw) != 0 else 0
    results[name] = {
        "f_statistic": round(float(f), 4),
        "p_value": round(float(p), 4),
        "eta_squared": round(float(eta2), 4),
        "df_between": len(groups) - 1,
        "df_within": sum(len(g) for g in groups) - len(groups),
    }

print(json.dumps({"oneway": results, "raw_datasets": datasets_oneway}, indent=2, default=lambda o: o.tolist() if hasattr(o,'tolist') else o))
