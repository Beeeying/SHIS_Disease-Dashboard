#!/usr/bin/env python3
"""
Build dashboard_data.json from HIS Excel raw export.

Usage:
  python3 build_dashboard_data.py \
    --input "raw_data/All Hospitals Data for last Three month.xlsx" \
    --definitions "data/disease_definitions.json" \
    --output "data/dashboard_data.json" \
    --expected-hospitals 12

Dependencies:
  pip install pandas openpyxl
"""

from __future__ import annotations

import argparse
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import pandas as pd


def clean_column_name(value: Any) -> str:
    if value is None:
        return "Unnamed"
    value = re.sub(r"\s+", " ", str(value).strip())
    return value or "Unnamed"


def make_unique_columns(columns: list[Any]) -> list[str]:
    cleaned: list[str] = []
    seen: dict[str, int] = {}
    for c in columns:
        base = clean_column_name(c)
        seen[base] = seen.get(base, 0) + 1
        cleaned.append(base if seen[base] == 1 else f"{base}_{seen[base]}")
    return cleaned


def load_excel(path: Path) -> pd.DataFrame:
    df = pd.read_excel(path, sheet_name=0, engine="openpyxl")
    df.columns = make_unique_columns(list(df.columns))
    return df


def find_columns(df: pd.DataFrame, prefixes_or_names: list[str]) -> list[str]:
    """Return columns whose normalized name matches one of the requested names/prefixes."""
    wanted = [x.lower() for x in prefixes_or_names]
    result = []
    for col in df.columns:
        low = col.lower()
        if low in wanted or any(low.startswith(w) for w in wanted):
            result.append(col)
    return result


def load_hospital_regions(path: Path) -> dict[str, str]:
    if not path:
        return {}

    path = Path(path)
    if not path.exists():
        raise FileNotFoundError(f"Hospital regions file not found: {path}")

    with path.open("r", encoding="utf-8") as handle:
        payload = json.load(handle)

    if not isinstance(payload, dict):
        raise ValueError("Hospital regions file must contain a JSON object")

    return {
        str(key).strip(): str(value).strip()
        for key, value in payload.items()
        if key is not None and value is not None
    }


def normalize_base_columns(df: pd.DataFrame) -> pd.DataFrame:
    # Date
    if "Date" not in df.columns:
        raise ValueError("Required column not found: Date")
    df["date"] = pd.to_datetime(df["Date"], errors="coerce")

    # Hospital
    hospital_cols = [c for c in df.columns if c.lower() == "hospital name"]
    if not hospital_cols:
        raise ValueError("Required column not found: Hospital Name")
    df["hospital"] = df[hospital_cols[0]].astype(str).str.strip().replace({"nan": None, "": None})

    # Gender
    if "Gender" in df.columns:
        df["gender"] = df["Gender"].astype(str).str.strip().str.upper().replace({"NAN": None, "": None})
    else:
        df["gender"] = None

    # Age
    if "Age" in df.columns:
        df["age"] = pd.to_numeric(df["Age"], errors="coerce")
    else:
        df["age"] = pd.NA

    return df


def age_group(age: Any) -> str:
    try:
        if pd.isna(age):
            return "Unknown/Invalid"
        age = float(age)
    except Exception:
        return "Unknown/Invalid"

    if age < 0 or age > 120:
        return "Unknown/Invalid"
    if age <= 4:
        return "0-4"
    if age <= 14:
        return "5-14"
    if age <= 24:
        return "15-24"
    if age <= 44:
        return "25-44"
    if age <= 64:
        return "45-64"
    return "65+"


def make_text_blob(df: pd.DataFrame) -> pd.Series:
    text_columns = []
    for col in df.columns:
        low = col.lower()
        if (
            "clinic remark" in low
            or "icd10 name" in low
            or "lab name" in low
            or "med name" in low
        ):
            text_columns.append(col)

    blob = pd.Series("", index=df.index, dtype="string")
    for col in text_columns:
        blob = blob + " " + df[col].fillna("").astype(str).str.lower()

    return blob


def make_icd_blob(df: pd.DataFrame) -> pd.Series:
    icd_columns = [c for c in df.columns if c.lower().startswith("icd10code")]
    blob = pd.Series("", index=df.index, dtype="string")
    for col in icd_columns:
        blob = blob + " " + df[col].fillna("").astype(str).str.upper().str.strip()
    return blob


def icd_prefix_mask(icd_blob: pd.Series, prefixes: list[str]) -> pd.Series:
    if not prefixes:
        return pd.Series(False, index=icd_blob.index)

    # Match prefixes at token boundaries in the combined ICD blob.
    # Example: A90 should match A90 and A90.0 but not XA90.
    escaped = [re.escape(p.upper()) for p in prefixes]
    pattern = r"(?:^|\s)(?:" + "|".join(escaped) + r")"
    return icd_blob.str.contains(pattern, regex=True, na=False)


def keyword_mask(text_blob: pd.Series, keywords: list[str]) -> pd.Series:
    if not keywords:
        return pd.Series(False, index=text_blob.index)

    escaped = [re.escape(k.lower()) for k in keywords]
    pattern = "|".join(escaped)
    return text_blob.str.contains(pattern, regex=True, na=False)


def disease_mask(df: pd.DataFrame, icd_blob: pd.Series, text_blob: pd.Series, rule: dict[str, Any]) -> pd.Series:
    mode = rule.get("match_mode", "icd_only")
    m_icd = icd_prefix_mask(icd_blob, rule.get("icd10_prefixes", []))
    m_key = keyword_mask(text_blob, rule.get("keywords_any", []))

    if mode == "icd_only":
        return m_icd
    if mode == "keyword_only":
        return m_key
    if mode == "icd_and_keyword":
        return m_icd & m_key
    if mode == "icd_or_keyword":
        return m_icd | m_key

    raise ValueError(f"Unknown match_mode: {mode}")


def week_start_monday(date_series: pd.Series) -> pd.Series:
    return (date_series - pd.to_timedelta(date_series.dt.weekday, unit="D")).dt.strftime("%Y-%m-%d")


def month_label(date_series: pd.Series) -> pd.Series:
    return date_series.dt.strftime("%Y-%m")


def group_records(df: pd.DataFrame, group_cols: list[str], output_names: list[str]) -> list[dict[str, Any]]:
    if df.empty:
        return []

    grouped = (
        df.groupby(group_cols, dropna=False)
        .size()
        .reset_index(name="count")
        .sort_values(group_cols)
    )

    grouped = grouped.rename(columns=dict(zip(group_cols, output_names)))
    records = grouped.to_dict(orient="records")

    # Convert numpy values to native Python for JSON.
    for row in records:
        row["count"] = int(row["count"])
        for key, val in list(row.items()):
            if pd.isna(val):
                row[key] = None
    return records


AGE_GROUP_ORDER = ["0-4", "5-14", "15-24", "25-44", "45-64", "65+", "Unknown/Invalid"]


def sort_age_records(records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    order = {name: i for i, name in enumerate(AGE_GROUP_ORDER)}
    return sorted(records, key=lambda r: order.get(r.get("age_group"), 999))


def disease_summary(df: pd.DataFrame, disease_name: str) -> dict[str, Any]:
    subset = df.copy()
    subset["age_group"] = subset["age"].apply(age_group)
    subset["week"] = week_start_monday(subset["date"])
    subset["month"] = month_label(subset["date"])
    if "region" not in subset.columns:
        subset["region"] = "Unknown"
    else:
        subset["region"] = subset["region"].fillna("Unknown")

    by_age = sort_age_records(group_records(subset, ["age_group"], ["age_group"]))

    return {
        "total": int(len(subset)),
        "weekly_by_hospital": group_records(subset, ["week", "hospital"], ["week", "hospital"]),
        "monthly_by_hospital": group_records(subset, ["month", "hospital"], ["month", "hospital"]),
        "monthly": group_records(subset, ["month"], ["month"]),
        "by_hospital": group_records(subset, ["hospital"], ["hospital"]),
        "by_region": group_records(subset, ["region"], ["region"]),
        "weekly_by_region": group_records(subset, ["week", "region"], ["week", "region"]),
        "monthly_by_region": group_records(subset, ["month", "region"], ["month", "region"]),
        "by_gender": group_records(subset, ["gender"], ["gender"]),
        "by_age": by_age,
    }


def validate_disease_summary(summary: dict[str, Any]) -> dict[str, Any]:
    total = summary["total"]
    checks = {}
    for key in [
        "weekly_by_hospital",
        "monthly_by_hospital",
        "monthly",
        "by_hospital",
        "by_region",
        "weekly_by_region",
        "monthly_by_region",
        "by_gender",
        "by_age",
    ]:
        checks[f"{key}_sum"] = sum(int(r["count"]) for r in summary.get(key, []))
        checks[f"{key}_matches_total"] = checks[f"{key}_sum"] == total
    return checks


def build_dashboard_data(
    input_path: Path,
    definitions_path: Path,
    expected_hospitals: int | None = None,
    hospital_regions_path: Path | None = None,
) -> dict[str, Any]:
    definitions = json.loads(definitions_path.read_text(encoding="utf-8"))
    hospital_regions = load_hospital_regions(
        hospital_regions_path or Path(__file__).resolve().parent.parent / "data" / "hospital_regions.json"
    )

    df = load_excel(input_path)
    original_columns = list(df.columns)
    df = normalize_base_columns(df)

    # Restrict aggregation to rows with a valid date and hospital.
    valid_for_time_series = df["date"].notna() & df["hospital"].notna()
    df_valid = df.loc[valid_for_time_series].copy()
    df_valid["region"] = df_valid["hospital"].map(hospital_regions).fillna("Unknown")

    text_blob = make_text_blob(df_valid)
    icd_blob = make_icd_blob(df_valid)

    diseases: dict[str, Any] = {}
    validation: dict[str, Any] = {}

    for disease_name, rule in definitions["diseases"].items():
        mask = disease_mask(df_valid, icd_blob, text_blob, rule)
        subset = df_valid.loc[mask].copy()
        diseases[disease_name] = disease_summary(subset, disease_name)
        validation[disease_name] = validate_disease_summary(diseases[disease_name])

    age_numeric = pd.to_numeric(df["age"], errors="coerce")
    invalid_age_mask = age_numeric.isna() | (age_numeric < 0) | (age_numeric > 120)

    hospitals = sorted([h for h in df_valid["hospital"].dropna().unique().tolist()])
    hospitals_without_region = sorted(
        [h for h in hospitals if str(h) not in hospital_regions]
    )

    data_quality = {
        "source_row_count": int(len(df)),
        "valid_rows_for_time_series": int(len(df_valid)),
        "missing_date_count": int(df["date"].isna().sum()),
        "missing_hospital_count": int(df["hospital"].isna().sum()),
        "missing_gender_count": int(df["gender"].isna().sum()) if "gender" in df else None,
        "missing_age_count": int(age_numeric.isna().sum()),
        "invalid_age_count": int(invalid_age_mask.sum()),
        "reporting_hospitals": len(hospitals),
        "expected_hospitals": expected_hospitals,
        "hospital_list": hospitals,
        "hospitals_without_region": hospitals_without_region,
        "disease_validation": validation,
    }

    metadata = {
        "schema_version": "0.1",
        "source_file": input_path.name,
        "generated_at_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "date_min": df_valid["date"].min().strftime("%Y-%m-%d") if not df_valid.empty else None,
        "date_max": df_valid["date"].max().strftime("%Y-%m-%d") if not df_valid.empty else None,
        "source_columns": original_columns,
        "definition_file": definitions_path.name,
        "definition_schema_version": definitions.get("schema_version"),
        "hospital_regions": hospital_regions,
        "geojson_region_property": "NAM_1",
    }

    return {
        "metadata": metadata,
        "disease_definitions": definitions["diseases"],
        "data_quality": data_quality,
        "diseases": diseases,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, help="Path to HIS Excel raw export")
    parser.add_argument("--definitions", required=True, help="Path to disease_definitions.json")
    parser.add_argument("--output", required=True, help="Output path for dashboard_data.json")
    parser.add_argument("--expected-hospitals", type=int, default=None)
    parser.add_argument(
        "--hospital-regions",
        default=str(Path(__file__).resolve().parent.parent / "data" / "hospital_regions.json"),
        help="Path to hospital_regions.json",
    )
    args = parser.parse_args()

    input_path = Path(args.input)
    definitions_path = Path(args.definitions)
    output_path = Path(args.output)
    hospital_regions_path = Path(args.hospital_regions)

    dashboard_data = build_dashboard_data(
        input_path=input_path,
        definitions_path=definitions_path,
        expected_hospitals=args.expected_hospitals,
        hospital_regions_path=hospital_regions_path,
    )

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(dashboard_data, indent=2, ensure_ascii=False), encoding="utf-8")

    print(f"Wrote {output_path}")
    print(f"Date range: {dashboard_data['metadata']['date_min']} to {dashboard_data['metadata']['date_max']}")
    print(f"Reporting hospitals: {dashboard_data['data_quality']['reporting_hospitals']}")
    print("Disease totals:")
    for disease, payload in dashboard_data["diseases"].items():
        print(f"  - {disease}: {payload['total']}")


if __name__ == "__main__":
    main()
