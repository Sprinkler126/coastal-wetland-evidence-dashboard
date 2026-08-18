# 证据资产目录

本目录保存网页中“历史事实—模型解释—综合证据筛查分类”所依赖的可审计资产。目录按内容和职责命名，不再按开发阶段或日期编号命名。

## 目录结构

| 路径 | 内容 | 是否可重算 |
|---|---|---|
| `contracts/` | 权威面板、维度、证据类型和证据包结构约束 | 不适用 |
| `data/authoritative/` | 1,166 条空间单元—年份权威面板 | 原始输入 |
| `data/historical/` | 年度值、单元趋势、城市群趋势、质量标记和面板质量摘要 | 是 |
| `data/screening_matrix/` | 20 个“湿地类型 × 城市群”单元的综合证据 | 部分；见方法说明 |
| `data/model/` | 证据包实际引用的 TWFE、模型状态、SHAP 频次和动态面板诊断 | 上游模型结果 |
| `methods/` | 计算口径、综合证据矩阵的整合规则与边界 | 不适用 |
| `reference/` | 原始论文图 PNG，仅用于来源核对 | 否 |

网页运行文件仍位于 `web/web/data/`。其中 `evidence_bundle.json` 是页面的统一数据入口，`screening_evidence.csv` 是可直接下载和核查的综合证据矩阵副本。

## 可复算流程

```powershell
python scripts/evidence/build_historical_evidence.py
python scripts/evidence/build_evidence_bundle.py
python scripts/evidence/validate_screening_evidence.py
node scripts/update-data-manifest.mjs
node scripts/test-data-contracts.mjs
```

历史指标会从权威 Excel 重新计算。证据包随后把历史指标、筛查矩阵和模型证据合并为网页数据。

## 综合证据矩阵的定位

网页将这项成果命名为“湿地—城市群综合证据矩阵”。它是综合筛查/复核矩阵，不是由一个风险公式直接产生的概率模型。原始 `High / Medium / Decoupling / Insufficient` 分类来自论文中的源图（原标为 Figure 14）；支撑表把 TWFE、SHAP、局部效应、GMM 和样本量并列到每个格子中，并单独计算“证据支撑等级”。分类与支撑等级是两个不同字段，不能互相替代。完整口径见 [`methods/screening_matrix.md`](methods/screening_matrix.md)。

## 来源完整性说明

当前 Demo 包提供了综合证据矩阵及其来源清单，但没有随包提供生成该矩阵所引用的全部 2026-06-26 之前 TWFE/SHAP 原始结果表。因此：

- 支撑矩阵可以逐格审计、与网页证据包交叉校验；
- 历史趋势和质量标记可以从权威面板完整重算；
- 不能声称该综合证据矩阵能仅凭当前仓库从最初模型结果完整重建。

`data/screening_matrix/source_inventory.csv` 保存原始来源清单，`methods/source_figure_method_note.md` 保存原项目的方法文字快照。
