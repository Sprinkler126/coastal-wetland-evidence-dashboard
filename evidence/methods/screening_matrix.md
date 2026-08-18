# 湿地—城市群综合证据矩阵

## 这个矩阵是什么

矩阵将四类湿地与五个沿海城市群组合成 20 个筛查单元。`High`、`Medium`、`Decoupling` 和 `Insufficient` 是原论文图保留的综合筛查/复核分类，不是未来风险概率，也不是一个统一分数按阈值自动切分的结果。网页使用“湿地—城市群综合证据矩阵”这一名称，避免脱离论文语境后只显示图号。

网页使用 `evidence/data/screening_matrix/supporting_evidence.csv` 作为逐格证据来源。每个格子同时展示历史趋势和以下模型证据，帮助读者理解“为什么值得复核”，而不是把分类包装成确定结论。

## 每个格子使用的证据

1. **区域 TWFE 显著项**：城市群回归中 $p < 0.10$ 的变量。
2. **区域 TWFE 显著负向项**：同时满足 $p < 0.10$ 且系数小于 0 的变量，作为历史面积负向关联证据。
3. **城市群 SHAP Top 3**：该湿地—城市群模型中平均绝对 SHAP 最大的三个变量，表示预测贡献，不表示因果。
4. **局部效应/弹性 Top 3**：在观测范围 Q10–Q90 内模型响应最敏感的三个变量，不表示干预效果。
5. **湿地层面 GMM 滞后项**：显著正向滞后项作为路径依赖或恢复滞后的补充证据；不稳定结果必须保留为限制。
6. **样本量**：该湿地—城市群组合可用于模型分析的空间单元—年份观测数。

## 证据支撑等级如何计算

支撑等级与源图分类分开计算。先定义三个二元条件：

- $T=1$：存在至少一个显著负向区域 TWFE 项；
- $S=1$：负向 TWFE 变量组与城市群 SHAP Top 3 变量组至少有一个重合；
- $G=1$：湿地层面 GMM 滞后项显著为正。

基础分数为 $E=T+S+G$：

| 条件 | 支撑等级 |
|---|---|
| 原分类为 `Insufficient` 或 `Decoupling` | `cautionary/interpretive` |
| $E=3$ | `strong multi-source support` |
| $E=2$ | `moderate support` |
| $E=1$ | `limited support` |
| $E=0$ | `weak direct quantitative support` |

当前 20 格中共有 2 个强多源支撑、4 个中等支撑、10 个弱直接定量支撑和 4 个审慎/解释型单元。这里的“弱支撑”表示现有定量证据链较弱，不等于低优先级或低风险。

## 两个容易混淆的字段

- `Figure14_Category`：来自原论文图的筛查/复核分类；字段名仅为保留来源追踪，不作为网页名称。
- `Evidence_Support_Grade`：根据现有 TWFE、SHAP 与 GMM 交叉证据计算的支撑强度。

网页不能只展示分类而隐藏支撑等级，也不能用支撑等级反推未来概率。

## 当前可复现边界

原 Demo 包保留了支撑矩阵、原图、来源清单和生成逻辑，但未包含生成脚本依赖的全部旧版 `heterogeneity_results.csv`、`gmm_results.csv`、`shap_by_cluster.csv`、`partial_effect_summary.csv` 和 `sample_matrix.csv`。因此本仓库提供：

- 支撑矩阵的结构、分类计数、支撑等级和网页嵌入一致性校验；
- 当前证据包实际使用的审稿模型表；
- 对原始生成算法的透明说明；
- 不宣称能够从缺失的旧上游表完整重建该矩阵。

运行 `python scripts/evidence/validate_screening_evidence.py` 可执行当前可支持的确定性校验。
