# Dashboard Data Contract

## Active data source

The frontend loads:

data/dashboard_data.json

## Top-level structure

- metadata
- disease_definitions
- data_quality
- diseases

## metadata

- date_range
- reporting_hospitals
- expected_hospitals
- hospital_regions
- geojson_region_property

## diseases

Each disease contains:

- total
- weekly_by_hospital
- monthly_by_hospital
- monthly
- by_hospital
- by_gender
- by_age
- by_region
- weekly_by_region
- monthly_by_region