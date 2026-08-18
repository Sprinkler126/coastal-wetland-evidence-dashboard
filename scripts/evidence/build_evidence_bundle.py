#!/usr/bin/env python3
"""Build the deterministic, auditable evidence bundle used by the dashboard."""
from __future__ import annotations

import hashlib
import json
import math
from pathlib import Path
from typing import Any

import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
CONTRACT_PATH = ROOT / "evidence/contracts/evidence_contract.json"
HISTORICAL_DIR = ROOT / "evidence/data/historical"
MODEL_DIR = ROOT / "evidence/data/model"
OUTPUT_PATH = ROOT / "web/web/data/evidence_bundle.json"
SCHEMA_VERSION = "1.0.0"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def clean(value: Any) -> Any:
    if value is None or value is pd.NA:
        return None
    if isinstance(value, float) and (math.isnan(value) or math.isinf(value)):
        return None
    if hasattr(value, "item"):
        return clean(value.item())
    if isinstance(value, dict):
        return {str(key): clean(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [clean(item) for item in value]
    return value


def source_meta(path: Path, kind: str, selector: str, row_count: int | None = None) -> dict:
    relative = path.relative_to(ROOT).as_posix()
    result = {"path": relative, "kind": kind, "format": path.suffix.lstrip("."), "sha256": sha256(path), "size_bytes": path.stat().st_size, "selector": selector}
    if row_count is not None:
        result["row_count"] = row_count
    return result


def evidence_id(*parts: Any) -> str:
    raw = "|".join("" if part is None else str(part) for part in parts)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:20]


def period(start: Any, end: Any) -> dict:
    return {"start_year": None if start is None else int(start), "end_year": None if end is None else int(end), "label": None if start is None or end is None else f"{int(start)}-{int(end)}"}


def common_evidence(kind: str, scale: str, wetland: str, cluster: str | None, unit: str | None, method: str, source: dict, metrics: dict, limitations: list[str], status: str = "available", feature: str | None = None, period_info: dict | None = None) -> dict:
    return clean({
        "evidence_id": evidence_id(kind, scale, cluster, unit, wetland, feature, method),
        "evidence_type": kind,
        "status": status,
        "period": period_info or period(2001, 2022),
        "scale": scale,
        "wetland_code": wetland,
        "cluster_code": cluster,
        "unit_code": unit,
        "feature_code": feature,
        "method": method,
        "source": source,
        "metrics": metrics,
        "limitations": limitations,
    })


def read_csv(path: Path, required: list[str]) -> pd.DataFrame:
    frame = pd.read_csv(path)
    missing = [column for column in required if column not in frame.columns]
    if missing:
        raise ValueError(f"{path}: missing columns {missing}")
    return frame


def row_dict(row: pd.Series) -> dict:
    return {key: clean(value) for key, value in row.to_dict().items()}


def build_bundle() -> dict:
    contract = json.loads(CONTRACT_PATH.read_text(encoding="utf-8"))
    source = ROOT / contract["authoritative_input"]["path"]
    if sha256(source) != contract["authoritative_input"]["sha256"]:
        raise ValueError("authoritative input SHA-256 mismatch")
    clusters = [item["code"] for item in contract["clusters"]]
    wetlands = [item["code"] for item in contract["dimensions"]["wetlands"]]
    drivers = [item["code"] for item in contract["dimensions"]["drivers"]]
    cluster_order = {value: index for index, value in enumerate(clusters)}
    wetland_order = {value: index for index, value in enumerate(wetlands)}

    cluster_path = HISTORICAL_DIR / "cluster_trends.csv"
    unit_path = HISTORICAL_DIR / "unit_trends.csv"
    flags_path = HISTORICAL_DIR / "quality_flags.csv"
    panel_path = HISTORICAL_DIR / "panel_quality.json"
    twfe_path = MODEL_DIR / "regional_twfe_coefficients.csv"
    model_path = MODEL_DIR / "regional_model_summary.csv"
    shap_path = MODEL_DIR / "cluster_grouped_shap_top3_frequency.csv"
    diagnostics_path = MODEL_DIR / "dynamic_panel_diagnostics.csv"
    risk_path = ROOT / "evidence/data/screening_matrix/supporting_evidence.csv"
    partial_path = ROOT / "web/web/data/partial_effect_summary.json"
    source_paths = [source, cluster_path, unit_path, flags_path, panel_path, twfe_path, model_path, shap_path, diagnostics_path, risk_path, partial_path]

    cluster_trends = read_csv(cluster_path, ["cluster", "wetland", "start_year", "end_year", "start_value", "end_value"])
    unit_trends = read_csv(unit_path, ["city", "cluster", "wetland", "start_year", "end_year"])
    flags = read_csv(flags_path, ["scope", "entity", "flag", "count", "detail"])
    twfe = read_csv(twfe_path, ["Outcome", "Cluster", "Variable", "Coef", "SE", "p_value", "CI_low", "CI_high", "N", "N_cities"])
    model_summary = read_csv(model_path, ["Outcome", "Cluster", "N_cities", "N_obs", "status"])
    shap = read_csv(shap_path, ["Outcome", "Cluster", "Feature", "n_fold_top3"])
    risk = read_csv(risk_path, ["Wetland", "Wetland_Code", "Cluster", "Figure14_Category", "Figure14_Cell_Label", "Sample_N_city_year", "Regional_TWFE_significant_terms_p_lt_0_10", "Regional_TWFE_significant_negative_terms_p_lt_0_10", "Cluster_SHAP_top3", "Cluster_partial_effect_top3_by_elasticity", "Wetland_GMM_lag_status", "Wetland_GMM_lag_coef", "Wetland_GMM_lag_p_value", "Evidence_Support_Grade", "Evidence_Notes"])
    diagnostics = read_csv(diagnostics_path, ["Outcome", "Transformation", "Estimation", "Diagnostic_Status", "Error"])
    partial = json.loads(partial_path.read_text(encoding="utf-8"))
    panel = json.loads(panel_path.read_text(encoding="utf-8"))

    if cluster_trends.duplicated(["cluster", "wetland"]).any() or unit_trends.duplicated(["city", "cluster", "wetland"]).any():
        raise ValueError("duplicate historical evidence keys")
    if len(cluster_trends) != len(clusters) * len(wetlands) or len(unit_trends) != 212:
        raise ValueError("historical evidence cardinality mismatch")
    if set(risk.Cluster) != set(clusters) or set(risk.Wetland_Code) != set(wetlands):
        raise ValueError("screening matrix enumeration mismatch")
    if risk.duplicated(["Wetland_Code", "Cluster"]).any() or len(risk) != len(clusters) * len(wetlands):
        raise ValueError("screening matrix cardinality mismatch")
    expected_categories = {"High": 7, "Medium": 9, "Decoupling": 1, "Insufficient": 3}
    if risk["Figure14_Category"].value_counts().to_dict() != expected_categories:
        raise ValueError("screening category counts mismatch")

    source_metadata = []
    for path in source_paths:
        kind = "authoritative" if path == source else "derived_input"
        selector = contract["authoritative_input"]["sheet"] if path == source else "all records"
        if path.suffix == ".json":
            selector = "top-level JSON"
        source_metadata.append(source_meta(path, kind, selector, None))
    source_metadata.sort(key=lambda item: item["path"])
    manifest_hash = hashlib.sha256(json.dumps(source_metadata, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")).hexdigest()
    source_by_path = {item["path"]: item for item in source_metadata}

    flag_ids = {}
    quality_flags = []
    for _, row in flags.sort_values(["scope", "entity", "flag"]).iterrows():
        item = row_dict(row)
        flag_id = evidence_id("quality", item["scope"], item["entity"], item["flag"])
        flag_ids[(item["scope"], item["entity"], item["flag"])] = flag_id
        item.update({"flag_id": flag_id, "severity": "warning", "interpretation": "data applicability or calculation limitation", "evidence_impact": "do not interpret as low risk", "source": source_by_path[flags_path.relative_to(ROOT).as_posix()]})
        quality_flags.append(item)

    cluster_summary = []
    unit_evidence = []
    for cluster in clusters:
        for wetland in wetlands:
            trend = cluster_trends[(cluster_trends.cluster == cluster) & (cluster_trends.wetland == wetland)].iloc[0]
            model_rows = model_summary[(model_summary.Cluster == cluster) & (model_summary.Outcome == wetland)]
            model = row_dict(model_rows.iloc[0]) if len(model_rows) else {}
            raw_risk_row = row_dict(risk[(risk.Cluster == cluster) & (risk.Wetland_Code == wetland)].iloc[0])
            display_map = {
                "High": {"label": "High-priority review", "state": "high", "note": "High-priority evidence review category"},
                "Medium": {"label": "Medium-priority review", "state": "medium", "note": "Medium-priority evidence review category"},
                "Decoupling": {"label": "Decoupling review", "state": "decoupling", "note": "Decoupling evidence review category"},
                "Insufficient": {"label": "Insufficient data", "state": "insufficient-data", "note": "Insufficient-data review category"},
            }
            display = display_map[raw_risk_row["Figure14_Category"]]
            risk_row = {
                "Wetland": raw_risk_row["Wetland"],
                "Wetland_Code": raw_risk_row["Wetland_Code"],
                "Cluster": raw_risk_row["Cluster"],
                "Category": raw_risk_row["Figure14_Category"],
                "Cell_Label": raw_risk_row["Figure14_Cell_Label"],
                "Sample_N_city_year": raw_risk_row["Sample_N_city_year"],
                "Regional_TWFE_significant_terms_p_lt_0_10": raw_risk_row["Regional_TWFE_significant_terms_p_lt_0_10"],
                "Regional_TWFE_significant_negative_terms_p_lt_0_10": raw_risk_row["Regional_TWFE_significant_negative_terms_p_lt_0_10"],
                "Cluster_SHAP_top3": raw_risk_row["Cluster_SHAP_top3"],
                "Cluster_partial_effect_top3_by_elasticity": raw_risk_row["Cluster_partial_effect_top3_by_elasticity"],
                "Wetland_GMM_lag_status": raw_risk_row["Wetland_GMM_lag_status"],
                "Wetland_GMM_lag_coef": raw_risk_row["Wetland_GMM_lag_coef"],
                "Wetland_GMM_lag_p_value": raw_risk_row["Wetland_GMM_lag_p_value"],
                "Evidence_Support_Grade": raw_risk_row["Evidence_Support_Grade"],
                "Evidence_Notes": raw_risk_row["Evidence_Notes"],
                "Display_Label": display["label"],
                "Display_State": display["state"],
                "Display_Note": display["note"],
            }
            limitations = ["descriptive historical evidence; not a future prediction", "Matrix categories are synthesis-based screening/review categories, not future risk probabilities.", "Cautionary or decoupling cells require contextual interpretation and additional review."]
            if cluster == "BYS" and wetland == "Mangrove":
                limitations.append("BYS Mangrove has structural zero variation and the regional TWFE model failed")
            trend_ev = common_evidence("FACT", "cluster", wetland, cluster, None, "deterministic endpoint change and centered OLS slope", source_by_path[cluster_path.relative_to(ROOT).as_posix()], row_dict(trend), limitations, period_info=period(trend.start_year, trend.end_year))
            trend_ev["quality_flag_ids"] = [flag_ids[key] for key in flag_ids if key[1].startswith(f"{cluster}:") and key[2] in {"STRUCTURAL_ZERO", "RATE_UNDEFINED_ZERO_BASE", "NEAR_CONSTANT_TARGET"}]
            cluster_summary.append({"cluster_code": cluster, "wetland_code": wetland, "status": risk_row["Display_State"], "trend": trend_ev, "model_summary": model, "risk_matrix": risk_row, "evidence": []})

            for _, unit in unit_trends[(unit_trends.cluster == cluster) & (unit_trends.wetland == wetland)].sort_values("city").iterrows():
                unit_name = unit.city
                unit_flags = [flag_ids[key] for key in flag_ids if key[1] == f"{unit_name}:{wetland}" or key[1] == f"{unit_name}:{wetland}" and key[0] == "unit_wetland"]
                ev = common_evidence("FACT", "spatial_unit", wetland, cluster, unit_name, "deterministic endpoint change and centered OLS slope", source_by_path[unit_path.relative_to(ROOT).as_posix()], row_dict(unit), ["unit-level descriptive trend; no unit-level TWFE or SHAP is inferred", "historical observation only; not a future prediction"], period_info=period(unit.start_year, unit.end_year))
                ev["quality_flag_ids"] = unit_flags
                unit_evidence.append({"city": unit_name, "cluster_code": cluster, "wetland_code": wetland, "evidence": [ev], "available_scales": ["spatial_unit"], "not_available": ["regional TWFE, grouped SHAP and partial-effect are not downscaled to this unit"]})

    def evidence_sort(item: dict) -> tuple:
        return (wetland_order.get(item["wetland_code"], 999), cluster_order.get(item.get("cluster_code"), 999), item.get("unit_code") or "")
    cluster_summary.sort(key=lambda item: (cluster_order[item["cluster_code"]], wetland_order[item["wetland_code"]]))
    unit_evidence.sort(key=lambda item: (cluster_order[item["cluster_code"]], item["city"], wetland_order[item["wetland_code"]]))

    model_evidence = []
    for _, row in twfe.sort_values(["Cluster", "Outcome", "Variable"]).iterrows():
        item = row_dict(row)
        cluster, wetland, variable = item["Cluster"], item["Outcome"], item["Variable"]
        is_failure = variable == "__model__" or bool(item.get("Error"))
        model_evidence.append(common_evidence("INSUFFICIENT" if is_failure else "ASSOCIATION", "cluster", wetland, cluster, None, "regional two-way fixed-effects model", source_by_path[twfe_path.relative_to(ROOT).as_posix()], item, ["controlled association, not causal impact", "model-specific result within the observed period"] + ([f"model failure: {item.get('Error')} "] if is_failure else []), "failed" if is_failure else "estimable", None if variable == "__model__" else variable))
    shap_evidence = []
    for _, row in shap.sort_values(["Cluster", "Outcome", "Feature"]).iterrows():
        item = row_dict(row)
        shap_evidence.append(common_evidence("MODEL_ATTRIBUTION", "cluster", item["Outcome"], item["Cluster"], None, "grouped cross-validation SHAP top-three frequency", source_by_path[shap_path.relative_to(ROOT).as_posix()], item, ["model prediction contribution, not causal impact", "feature ranking does not establish ecological mechanism"], feature=item["Feature"]))
    partial_evidence = []
    for item in sorted(partial, key=lambda row: (row.get("Cluster_Code", ""), row.get("Wetland_Code", ""), row.get("Feature_Code", ""), row.get("Level", ""))):
        cluster = item.get("Cluster_Code")
        scale = "cluster" if item.get("Level") == "Cluster" else "global"
        partial_evidence.append(common_evidence("MODEL_ATTRIBUTION", scale, item["Wetland_Code"], None if cluster == "global" else cluster, None, "partial-effect model response over observed feature quantiles", source_by_path[partial_path.relative_to(ROOT).as_posix()], item, ["observed-range model response, not causal impact", "Q10-Q90 is an observed feature range, not an intervention range", "do not extrapolate beyond the observed range"], feature=item.get("Feature_Code")))
    diagnostic_evidence = []
    for _, row in diagnostics.sort_values(["Outcome", "Transformation", "Estimation"]).iterrows():
        item = row_dict(row)
        status = item["Diagnostic_Status"]
        diagnostic_evidence.append(common_evidence("INSUFFICIENT" if status == "unstable/failed" else "EXPLORATORY", "panel", item["Outcome"], None, None, "dynamic panel diagnostic specification", source_by_path[diagnostics_path.relative_to(ROOT).as_posix()], item, ["diagnostic evidence only; not a future prediction", "unstable or suggestive specifications do not establish persistence or causality"], status=status, feature=f"{item['Transformation']}:{item['Estimation']}"))

    bundle = {"schema_version": SCHEMA_VERSION, "contract_id": contract["contract_id"], "contract_version": contract["contract_version"], "bundle_id": manifest_hash, "generated_by": {"script": "scripts/evidence/build_evidence_bundle.py", "deterministic": True}, "source_metadata": source_metadata, "enumerations": {"clusters": clusters, "wetlands": wetlands, "drivers": drivers, "evidence_types": sorted(contract["evidence_types"])}, "cluster_summary": cluster_summary, "unit_evidence": unit_evidence, "quality_flags": quality_flags, "model_evidence": model_evidence + shap_evidence + partial_evidence + diagnostic_evidence, "limitations": ["The bundle covers observed 2001-2022 evidence only.", "SHAP and partial-effect values are model attribution or response summaries, not causal effects.", "Matrix categories are synthesis-based screening/review categories, not future risk probabilities.", "BYS is a demonstration selection, not an automatically selected highest-priority region."], "panel_quality": panel}
    return clean(bundle)


def main() -> None:
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    bundle = build_bundle()
    OUTPUT_PATH.write_text(json.dumps(bundle, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"PASS evidence bundle: {len(bundle['cluster_summary'])} cluster summaries, {len(bundle['unit_evidence'])} unit evidence, {len(bundle['quality_flags'])} quality flags, {len(bundle['model_evidence'])} model evidence")


if __name__ == "__main__":
    main()
