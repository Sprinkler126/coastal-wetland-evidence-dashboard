# 历史趋势与质量标记计算口径

## 输入与分组

权威输入为 `evidence/data/authoritative/wetland_panel.xlsx` 的 `master_panel_v2_clean` 工作表，共 1,166 条记录，覆盖 53 个空间单元、2001–2022 年。产品聚焦红树林、潮滩、盐沼和沼泽四类湿地。

- 空间单元趋势：按 `City × Wetland` 分组，共 212 条。
- 城市群趋势：先按 `Cluster × Year` 汇总成员空间单元面积，再按 `Cluster × Wetland` 计算，共 20 条。
- 年度值：按 `City × Year × Wetland` 展开，共 4,664 条。

## 指标公式

设观测期起点面积为 $A_0$、终点面积为 $A_T$：

- 绝对变化：$\Delta A = A_T - A_0$。
- 相对变化率：$r = \Delta A / |A_0|$。
- 当 $A_0 = 0$ 时，相对变化率为 `null`，并记录 `RATE_UNDEFINED_ZERO_BASE`；不能将其解释为稳定或低优先级。
- 年斜率使用带截距普通最小二乘。年份先中心化，$\beta = \sum (t_i-\bar t)A_i / \sum (t_i-\bar t)^2$，单位为面积/年。

## 方向标签

方向标签来自确定性阈值，而不是分类模型：

- 绝对变化接近 0：历史稳定；
- 绝对变化大于阈值：历史增加；
- 绝对变化小于负阈值：历史减少。

网页中的这些标签只描述 2001–2022 年历史，不表示未来趋势。

## 质量标记

质量标记包括结构性零、目标近恒定、零起点变化率不可计算和 WorldPop 年份复用等情况。标记描述数据适用性与计算限制，不是风险等级，也不能被解释为“没有问题”。

可执行实现：`scripts/evidence/build_historical_evidence.py`。
