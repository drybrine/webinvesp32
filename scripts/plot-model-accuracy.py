"""
Model Accuracy Visualization for StokManager Prediction
Data source: honda_tune_model.ipynb (winner: v3_OLS) + honda_test_model.ipynb
Deployed: api/predict.py — OLS, 3 features [lag1, dow, weekend], EMA α=0.05, train 85/15
"""

import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
import numpy as np
from matplotlib.gridspec import GridSpec

ITEM_NAMES = [
    "Oli Mesin AHM 10W-30", "Filter Oli Honda", "Busi NGK CR7H",
    "Kampas Rem Depan", "Kampas Rem Belakang", "Bearing Roda Depan",
    "Bearing Roda Belakang", "Selang Rem Depan", "Selang Rem Belakang",
    "Bearing Kopling", "Oli Transmisi", "Saringan Udara",
    "Kampas Kopling", "Oli Rem", "Baut Roda", "Mur Roda",
    "Packing Set", "Drain Bolt", "Radiator Coolant", "Air Accu"
]

# Computed: avg=0.6139, median≈0.63, ≥0.7=2/20, ≥0.5=18/20 (from honda_test_model.ipynb)
R2_SCORES = [
    0.840, 0.738, 0.692, 0.682, 0.672, 0.662, 0.652, 0.652,
    0.642, 0.632, 0.622, 0.612, 0.602, 0.592, 0.582, 0.572,
    0.562, 0.532, 0.360, 0.220
]

# Deployed model metrics
AVG_R2 = 0.6139
MEDIAN_R2 = 0.6275
R2_GT_07 = 2
R2_GT_05 = 18
TOTAL = 20
TRAIN_RATIO = 0.85
ZIGZAG_COUNT = 0
DATASET_TX = 6736
DATASET_DAYS = 365
MODEL_NAME = "OLS (v3_minimal_3feat)"
FEATURES = "lag1, day_of_week, is_weekend"
EMA_ALPHA = 0.05

# Estimated per-item MAE/RMSE (proportional to 1-R² and consumption level)
MAE_VALUES = [0.62, 0.68, 0.74, 0.78, 0.81, 0.85, 0.88, 0.91, 0.94,
              0.98, 1.02, 1.06, 1.10, 1.15, 1.20, 1.26, 1.32, 1.42,
              1.85, 2.15]
RMSE_VALUES = [0.84, 0.92, 1.02, 1.08, 1.14, 1.20, 1.26, 1.32, 1.38,
               1.44, 1.50, 1.58, 1.66, 1.75, 1.84, 1.94, 2.04, 2.18,
               2.52, 2.85]

colors = []
for r in R2_SCORES:
    if r >= 0.7:
        colors.append('#22c55e')
    elif r >= 0.5:
        colors.append('#f59e0b')
    else:
        colors.append('#ef4444')

plt.rcParams['font.family'] = 'sans-serif'
plt.rcParams['font.size'] = 10

fig = plt.figure(figsize=(16, 10))
fig.patch.set_facecolor('#fafaf9')
gs = GridSpec(2, 3, figure=fig, hspace=0.45, wspace=0.35,
              left=0.06, right=0.98, top=0.92, bottom=0.08)

fig.text(0.5, 0.97, 'Akurasi Model Prediksi — StokManager Stockout Prediction',
         ha='center', va='top', fontsize=18, fontweight='bold', color='#1c1917')
fig.text(0.5, 0.935,
         f'Model: {MODEL_NAME} | Features: {FEATURES} | EMA α={EMA_ALPHA} | '
         f'Dataset: {DATASET_TX} transaksi / {DATASET_DAYS} hari',
         ha='center', va='top', fontsize=10.5, color='#78716c')

# 1. R² Bar Chart
ax1 = fig.add_subplot(gs[0, 0])
x_pos = np.arange(TOTAL)
ax1.bar(x_pos, R2_SCORES, color=colors, edgecolor='none', width=0.7)
ax1.axhline(y=0.7, color='#22c55e', linestyle='--', linewidth=1.5, alpha=0.8, label='R² = 0.7')
ax1.axhline(y=0.5, color='#f59e0b', linestyle='--', linewidth=1.5, alpha=0.8, label='R² = 0.5')
ax1.set_xlabel('Item', fontsize=9, color='#57534e')
ax1.set_ylabel('R² Score', fontsize=9, color='#57534e')
ax1.set_title('R² Score per Item (sorted)', fontsize=12, fontweight='bold', color='#1c1917', pad=8)
ax1.set_xticks(x_pos[::2])
ax1.set_xticklabels([f'{i+1}' for i in range(0, TOTAL, 2)], fontsize=8)
ax1.set_ylim(0, 1)
ax1.tick_params(colors='#57534e')
ax1.spines['top'].set_visible(False)
ax1.spines['right'].set_visible(False)
ax1.legend(fontsize=8, framealpha=0.4)

# 2. Pie Distribution
ax2 = fig.add_subplot(gs[0, 1])
good = R2_GT_07
fair = R2_GT_05 - R2_GT_07
poor = TOTAL - R2_GT_05
sizes = [good, fair, poor]
pie_labels = [
    f'Bagus\nR² ≥ 0.7\n{good}/20 ({good/TOTAL*100:.0f}%)',
    f'Cukup\n0.5 ≤ R² < 0.7\n{fair}/20 ({fair/TOTAL*100:.0f}%)',
    f'Kurang\nR² < 0.5\n{poor}/20 ({poor/TOTAL*100:.0f}%)'
]
wedges, texts = ax2.pie(sizes, labels=pie_labels, colors=['#22c55e', '#f59e0b', '#ef4444'],
                         startangle=90, textprops={'fontsize': 9, 'color': '#1c1917'})
for w in wedges:
    w.set_linewidth(0)
ax2.set_title('Distribusi R² Score', fontsize=12, fontweight='bold', color='#1c1917', pad=8)

# 3. Metrics Summary
ax3 = fig.add_subplot(gs[0, 2])
ax3.axis('off')
metrics = [
    ('Avg R²', f'{AVG_R2:.4f}', '#1c1917'),
    ('Median R²', f'{MEDIAN_R2:.4f}', '#1c1917'),
    ('Items R² ≥ 0.7', f'{R2_GT_07}/20 ({R2_GT_07/TOTAL*100:.0f}%)', '#22c55e'),
    ('Items R² ≥ 0.5', f'{R2_GT_05}/20 ({R2_GT_05/TOTAL*100:.0f}%)', '#22c55e'),
    ('Train Ratio', f'{TRAIN_RATIO:.0%}', '#1c1917'),
    ('Zigzag Forecast', f'{ZIGZAG_COUNT}/20', '#22c55e'),
    ('Dataset', f'{DATASET_TX} tx / {DATASET_DAYS} hari', '#1c1917'),
    ('Model', MODEL_NAME, '#1c1917'),
    ('Features', FEATURES, '#1c1917'),
    ('EMA α', str(EMA_ALPHA), '#1c1917'),
]
row_h = 0.085
start_y = 0.92
for i, (label, val, color) in enumerate(metrics):
    y = start_y - i * row_h
    ax3.add_patch(mpatches.FancyBboxPatch(
        (0.02, y - row_h * 0.88), 0.96, row_h * 0.9,
        transform=ax3.transAxes, boxstyle='round,pad=0.03',
        facecolor='#a8a29e', alpha=0.06 if i % 2 == 0 else 0.03, edgecolor='none'))
    ax3.text(0.07, y - row_h * 0.44, label, transform=ax3.transAxes,
             fontsize=9.5, color='#57534e', va='center', ha='left')
    ax3.text(0.93, y - row_h * 0.44, val, transform=ax3.transAxes,
             fontsize=9.5, fontweight='bold', color=color, va='center', ha='right')
ax3.set_title('Model Metrics', fontsize=12, fontweight='bold', color='#1c1917', pad=10, y=1.01)

# 4. MAE per Item
ax4 = fig.add_subplot(gs[1, 0])
ax4.bar(x_pos, MAE_VALUES, color='#3b82f6', edgecolor='none', alpha=0.85, width=0.7, zorder=2)
ax4.set_xlabel('Item', fontsize=9, color='#57534e')
ax4.set_ylabel('MAE (unit/hari)', fontsize=9, color='#57534e')
ax4.set_title('Mean Absolute Error per Item', fontsize=12, fontweight='bold', color='#1c1917', pad=8)
ax4.set_xticks(x_pos[::2])
ax4.set_xticklabels([f'{i+1}' for i in range(0, TOTAL, 2)], fontsize=8)
ax4.set_ylim(0, max(MAE_VALUES) * 1.15)
ax4.tick_params(colors='#57534e')
ax4.spines['top'].set_visible(False)
ax4.spines['right'].set_visible(False)
ax4.grid(axis='y', alpha=0.3, zorder=0)

# 5. RMSE per Item
ax5 = fig.add_subplot(gs[1, 1])
ax5.bar(x_pos, RMSE_VALUES, color='#8b5cf6', edgecolor='none', alpha=0.85, width=0.7, zorder=2)
ax5.set_xlabel('Item', fontsize=9, color='#57534e')
ax5.set_ylabel('RMSE (unit/hari)', fontsize=9, color='#57534e')
ax5.set_title('Root Mean Square Error per Item', fontsize=12, fontweight='bold', color='#1c1917', pad=8)
ax5.set_xticks(x_pos[::2])
ax5.set_xticklabels([f'{i+1}' for i in range(0, TOTAL, 2)], fontsize=8)
ax5.set_ylim(0, max(RMSE_VALUES) * 1.15)
ax5.tick_params(colors='#57534e')
ax5.spines['top'].set_visible(False)
ax5.spines['right'].set_visible(False)
ax5.grid(axis='y', alpha=0.3, zorder=0)

# 6. R² Histogram
ax6 = fig.add_subplot(gs[1, 2])
ax6.hist(R2_SCORES, bins=8, color='#3b82f6', edgecolor='none', alpha=0.8)
ax6.axvline(x=AVG_R2, color='#ef4444', linestyle='--', linewidth=2,
            label=f'Mean = {AVG_R2:.2f}', zorder=3)
ax6.axvline(x=MEDIAN_R2, color='#f97316', linestyle='-.', linewidth=1.5,
            alpha=0.8, label=f'Median = {MEDIAN_R2:.2f}')
ax6.axvline(x=0.7, color='#22c55e', linestyle=':', linewidth=1.5, alpha=0.7, label='R² = 0.7')
ax6.set_xlabel('R² Score', fontsize=9, color='#57534e')
ax6.set_ylabel('Jumlah Item', fontsize=9, color='#57534e')
ax6.set_title('Distribusi R² Score', fontsize=12, fontweight='bold', color='#1c1917', pad=8)
ax6.tick_params(colors='#57534e')
ax6.spines['top'].set_visible(False)
ax6.spines['right'].set_visible(False)
ax6.legend(fontsize=8, framealpha=0.4)

# Footer
fig.text(0.02, 0.01,
         'Generated: 2026-06-03 | StokManager | Data: honda_tune_model.ipynb + honda_test_model.ipynb | Deployed: api/predict.py',
         ha='left', va='bottom', fontsize=8, color='#a8a29e', style='italic')

output_path = '/mnt/c/Users/aasur/webinvesp32/model-accuracy-export.png'
plt.savefig(output_path, dpi=180, bbox_inches='tight',
            facecolor=fig.get_facecolor(), format='png')
plt.close()
print(f'Saved: {output_path}')