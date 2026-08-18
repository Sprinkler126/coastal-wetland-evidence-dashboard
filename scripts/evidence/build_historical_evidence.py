#!/usr/bin/env python3
"""Generate deterministic historical wetland trends and quality flags."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Iterable

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
CONTRACT_PATH = ROOT / "evidence/contracts/evidence_contract.json"
OUTPUT_DIR = ROOT / "evidence/data/historical"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def centered_slope(years: Iterable[float], values: Iterable[float]) -> float:
    x = np.asarray(list(years), dtype=float)
    y = np.asarray(list(values), dtype=float)
    if len(x) < 2 or np.allclose(x, x[0]):
        return float("nan")
    centered = x - x.mean()
    return float((centered @ y) / (centered @ centered))


def trend_row(group: pd.DataFrame, value_column: str, **keys: str) -> dict:
    ordered = group.sort_values("Year")
    start = float(ordered[value_column].iloc[0])
    end = float(ordered[value_column].iloc[-1])
    change = end - start
    rate = None if np.isclose(start, 0.0) else change / abs(start)
    slope = centered_slope(ordered["Year"], ordered[value_column])
    return {
        **keys,
        "wetland": value_column,
        "start_year": int(ordered["Year"].iloc[0]),
        "end_year": int(ordered["Year"].iloc[-1]),
        "start_value": start,
        "end_value": end,
        "absolute_change": float(change),
        "relative_change_rate": None if rate is None else float(rate),
        "relative_change_status": "undefined_zero_start" if rate is None else "computed",
        "slope_per_year": None if np.isnan(slope) else slope,
        "slope_status": "insufficient_years" if np.isnan(slope) else "computed",
        "observations": int(len(ordered)),
        "direction": "increase" if change > 0 else "decrease" if change < 0 else "stable",
        "period": f"{int(ordered['Year'].iloc[0])}-{int(ordered['Year'].iloc[-1])}",
        "method": "deterministic endpoint change and centered OLS slope",
    }


def build_unit_trends(df: pd.DataFrame, wetlands: list[str]) -> pd.DataFrame:
    rows = []
    for (city, cluster, wetland), group in df.melt(
        id_vars=["Year", "City", "Cluster"], value_vars=wetlands,
        var_name="wetland", value_name="value"
    ).groupby(["City", "Cluster", "wetland"], sort=True):
        row = trend_row(group, "value", city=city, cluster=cluster)
        row["wetland"] = wetland
        rows.append(row)
    result = pd.DataFrame(rows)
    for metric in ["absolute_change", "relative_change_rate", "slope_per_year"]:
        result[f"cluster_{metric}_percentile"] = result.groupby(["wetland", "cluster"])[metric].rank(method="average", pct=True).round(6)
        result[f"national_{metric}_percentile"] = result.groupby("wetland")[metric].rank(method="average", pct=True).round(6)
    result["cluster_reference_n"] = result.groupby(["wetland", "cluster"])["city"].transform("count")
    result["national_reference_n"] = result.groupby("wetland")["city"].transform("count")
    return result.sort_values(["wetland", "cluster", "city"]).reset_index(drop=True)


def build_annual_trends(df: pd.DataFrame, wetlands: list[str]) -> pd.DataFrame:
    result = df[["Year", "City", "Cluster"] + wetlands].melt(
        id_vars=["Year", "City", "Cluster"], value_vars=wetlands,
        var_name="wetland", value_name="value"
    ).rename(columns={"Year": "year", "City": "city", "Cluster": "cluster"})
    result["scale"] = "spatial_unit"
    result["method"] = "observed raw wetland area from authoritative panel"
    return result.sort_values(["wetland", "cluster", "city", "year"]).reset_index(drop=True)


def build_cluster_trends(df: pd.DataFrame, wetlands: list[str]) -> pd.DataFrame:
    rows = []
    for (cluster, wetland), group in df.melt(
        id_vars=["Year", "City", "Cluster"], value_vars=wetlands,
        var_name="wetland", value_name="value"
    ).groupby(["Cluster", "wetland"], sort=True):
        annual = group.groupby("Year", as_index=False)["value"].sum()
        row = trend_row(annual, "value", cluster=cluster)
        row["wetland"] = wetland
        row["aggregation"] = "annual sum across spatial units"
        row["spatial_units"] = int(group.City.nunique())
        rows.append(row)
    result = pd.DataFrame(rows)
    for wetland in wetlands:
        mask = result.wetland == wetland
        result.loc[mask, "national_change_percentile"] = result.loc[mask]["absolute_change"].rank(method="average", pct=True).round(6)
    return result.sort_values(["wetland", "cluster"]).reset_index(drop=True)


def quality_overview(df: pd.DataFrame, tracked_columns: list[str], wetlands: list[str], contract: dict, source_hash: str) -> dict:
    stats = []
    for column in tracked_columns:
        series = df[column]
        stats.append({
            "field": column,
            "missing_count": int(series.isna().sum()),
            "missing_rate": float(series.isna().mean()),
            "zero_count": int((series == 0).sum()),
            "zero_rate": float((series == 0).mean()),
            "unique_count": int(series.nunique(dropna=True)),
        })
    cluster_sizes = df.groupby("Cluster")["City"].nunique().sort_index().to_dict()
    units = [
        {"city": city, "cluster": cluster}
        for city, cluster in df[["City", "Cluster"]].drop_duplicates().sort_values(["Cluster", "City"]).itertuples(index=False)
    ]
    return {
        "schema_version": "1.0.0",
        "contract_id": contract["contract_id"],
        "contract_version": contract["contract_version"],
        "source_sha256": source_hash,
        "rows": int(len(df)),
        "columns": int(len(df.columns)),
        "period": f"{int(df.Year.min())}-{int(df.Year.max())}",
        "years": [int(df.Year.min()), int(df.Year.max())],
        "spatial_units": int(df.City.nunique()),
        "clusters": {key: int(value) for key, value in cluster_sizes.items()},
        "duplicate_year_city_keys": int(df.duplicated(["Year", "City"]).sum()),
        "enumerations": {
            "years": sorted(int(year) for year in df.Year.unique()),
            "wetlands": wetlands,
            "clusters": contract["clusters"],
            "units": units,
        },
        "thresholds": {"structural_zero_share": 0.95, "near_constant_unique_values": 1, "small_sample_observations": 3},
        "field_quality": stats,
        "method": "deterministic pandas profiling of authoritative panel",
    }


def build_quality_flags(df: pd.DataFrame, wetlands: list[str], drivers: list[str]) -> pd.DataFrame:
    rows = []
    tracked = wetlands + drivers
    for column in tracked:
        series = df[column]
        if series.isna().any():
            rows.append({"scope": "field", "entity": column, "flag": "MISSING_VALUES", "count": int(series.isna().sum()), "detail": "missing values present"})
        if (series == 0).all():
            rows.append({"scope": "field", "entity": column, "flag": "STRUCTURAL_ZERO", "count": int(len(series)), "detail": "all observations are zero"})
    for wetland in wetlands:
        for (city, cluster), group in df.groupby(["City", "Cluster"], sort=True):
            values = group[wetland]
            if len(values) < 3:
                rows.append({"scope": "unit_wetland", "entity": f"{city}:{wetland}", "cluster": cluster, "flag": "SMALL_SAMPLE", "count": int(len(values)), "detail": "fewer than three observations"})
            if values.nunique(dropna=True) <= 1:
                rows.append({"scope": "unit_wetland", "entity": f"{city}:{wetland}", "cluster": cluster, "flag": "NEAR_CONSTANT_TARGET", "count": int(len(values)), "detail": "one or fewer distinct values"})
            if (values == 0).mean() >= 0.95:
                rows.append({"scope": "unit_wetland", "entity": f"{city}:{wetland}", "cluster": cluster, "flag": "STRUCTURAL_ZERO", "count": int((values == 0).sum()), "detail": "at least 95% of observations are zero"})
            if np.isclose(float(group.sort_values("Year")[wetland].iloc[0]), 0.0):
                rows.append({"scope": "unit_wetland", "entity": f"{city}:{wetland}", "cluster": cluster, "flag": "RATE_UNDEFINED_ZERO_BASE", "count": 1, "detail": "relative change is null because start value is zero"})
    for column in ["Total_Population", "Pop_Density"]:
        recent = df[df.Year.isin([2020, 2021, 2022])]
        reused = recent.groupby("City")[column].nunique(dropna=True) == 1
        for city in sorted(reused[reused].index):
            rows.append({"scope": "city_field", "entity": f"{city}:{column}", "flag": "WORLDPOP_REUSED_2020", "count": 3, "detail": "2020-2022 values are identical"})
    return pd.DataFrame(rows, columns=["scope", "entity", "cluster", "flag", "count", "detail"]).fillna("")


def main() -> None:
    contract = json.loads(CONTRACT_PATH.read_text(encoding="utf-8"))
    source = ROOT / contract["authoritative_input"]["path"]
    df = pd.read_excel(source, sheet_name=contract["authoritative_input"]["sheet"])
    wetlands = [item["code"] for item in contract["dimensions"]["wetlands"]]
    drivers = [item["code"] for item in contract["dimensions"]["drivers"]]
    source_hash = sha256(source)
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    annual = build_annual_trends(df, wetlands)
    units = build_unit_trends(df, wetlands)
    clusters = build_cluster_trends(df, wetlands)
    provenance = {
        "contract_id": contract["contract_id"],
        "contract_version": contract["contract_version"],
        "source_sha256": source_hash,
    }
    for key, value in reversed(list(provenance.items())):
        annual.insert(0, key, value)
        units.insert(0, key, value)
        clusters.insert(0, key, value)
    flags = build_quality_flags(df, wetlands, drivers)
    annual.to_csv(OUTPUT_DIR / "annual_trends.csv", index=False)
    units.to_csv(OUTPUT_DIR / "unit_trends.csv", index=False)
    clusters.to_csv(OUTPUT_DIR / "cluster_trends.csv", index=False)
    flags.to_csv(OUTPUT_DIR / "quality_flags.csv", index=False)
    overview = quality_overview(df, wetlands + drivers, wetlands, contract, source_hash)
    overview["flag_counts"] = {key: int(value) for key, value in flags.flag.value_counts().sort_index().items()}
    (OUTPUT_DIR / "panel_quality.json").write_text(json.dumps(overview, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"PASS historical evidence: {len(units)} unit-wetland trends, {len(clusters)} cluster-wetland trends, {len(flags)} quality flags")


if __name__ == "__main__":
    main()
