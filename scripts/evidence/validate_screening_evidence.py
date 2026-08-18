#!/usr/bin/env python3
"""Validate the screening evidence table and its dashboard representation."""
from __future__ import annotations

import csv
import hashlib
import json
from collections import Counter
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
SOURCE_PATH = ROOT / "evidence/data/screening_matrix/supporting_evidence.csv"
WEB_PATH = ROOT / "web/web/data/screening_evidence.csv"
BUNDLE_PATH = ROOT / "web/web/data/evidence_bundle.json"

EXPECTED_CATEGORIES = {
    "High": 7,
    "Medium": 9,
    "Decoupling": 1,
    "Insufficient": 3,
}
EXPECTED_SUPPORT_GRADES = {
    "strong multi-source support": 2,
    "moderate support": 4,
    "weak direct quantitative support": 10,
    "cautionary/interpretive": 4,
}
REQUIRED_COLUMNS = {
    "Wetland_Code",
    "Cluster",
    "Figure14_Category",
    "Figure14_Cell_Label",
    "Sample_N_city_year",
    "Regional_TWFE_significant_negative_terms_p_lt_0_10",
    "Cluster_SHAP_top3",
    "Cluster_partial_effect_top3_by_elasticity",
    "Wetland_GMM_lag_status",
    "Evidence_Support_Grade",
    "Evidence_Notes",
}


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def load_rows(path: Path) -> list[dict[str, str]]:
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        missing = REQUIRED_COLUMNS - set(reader.fieldnames or [])
        if missing:
            raise ValueError(f"{path}: missing columns {sorted(missing)}")
        return list(reader)


def main() -> None:
    rows = load_rows(SOURCE_PATH)
    if len(rows) != 20:
        raise ValueError(f"expected 20 screening-matrix cells, found {len(rows)}")

    keys = [(row["Wetland_Code"], row["Cluster"]) for row in rows]
    if len(set(keys)) != len(keys):
        raise ValueError("duplicate wetland-cluster cells")
    if Counter(row["Figure14_Category"] for row in rows) != Counter(EXPECTED_CATEGORIES):
        raise ValueError("screening category counts changed")
    if Counter(row["Evidence_Support_Grade"] for row in rows) != Counter(EXPECTED_SUPPORT_GRADES):
        raise ValueError("screening support-grade counts changed")
    if sha256(SOURCE_PATH) != sha256(WEB_PATH):
        raise ValueError("web screening CSV is not an exact copy of the auditable source")

    bundle = json.loads(BUNDLE_PATH.read_text(encoding="utf-8"))
    bundle_rows = {
        (item["wetland_code"], item["cluster_code"]): item["risk_matrix"]
        for item in bundle["cluster_summary"]
    }
    if set(bundle_rows) != set(keys):
        raise ValueError("evidence bundle and screening table have different cells")
    for row in rows:
        risk = bundle_rows[(row["Wetland_Code"], row["Cluster"])]
        comparisons = {
            "Category": row["Figure14_Category"],
            "Cell_Label": row["Figure14_Cell_Label"],
            "Evidence_Support_Grade": row["Evidence_Support_Grade"],
            "Evidence_Notes": row["Evidence_Notes"],
        }
        for field, expected in comparisons.items():
            if str(risk.get(field, "")) != expected:
                raise ValueError(f"bundle mismatch for {row['Wetland_Code']} / {row['Cluster']} / {field}")

    print("screening evidence validation passed")


if __name__ == "__main__":
    main()
