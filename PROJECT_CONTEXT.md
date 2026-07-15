# Project Context

This project is a disease surveillance dashboard for Somaliland hospitals.

Data source:
- HIS raw data exported as Excel files from hospitals
- Current dashboard visualizes 6 diseases: TB, Measles, Dengue, Malaria, Cholera, AWD
- Main users: TaiwanICDF / MoHD / hospital staff

Important goals:
1. Show weekly disease trends by hospital
2. Compare hospitals
3. Show age and gender distribution
4. Add data quality checks
5. Make case definitions transparent

Important constraints:
- Keep the dashboard simple and usable offline if possible
- Avoid large framework migration unless necessary
- Do not rewrite the whole project without asking
- Make small, reviewable changes