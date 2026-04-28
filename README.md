# Weekly Dinner Planner

A small offline-first PWA that turns the recipe spreadsheet into a weekly meal plan.

## Run locally

```bash
python3 -m http.server 18765 --directory docs --bind 127.0.0.1
```

Open <http://127.0.0.1:18765/>.

## Update recipes

Edit `recipies database.xlsx`, then regenerate the JSON:

```bash
python3 scripts/convert_recipes.py
```

The script normalizes spelling (`chiken` → `chicken`, etc.), splits multi-protein cells, and decodes the Excel-locale datetime quirks for "for how many days". Bump `CACHE_NAME` in `docs/sw.js` so installed clients pick up the new data.

## Regenerate icons

```bash
python3 docs/generate_icons.py
```

## Deploy

Push to GitHub. **Settings → Pages → Source: `main` + `/docs`.** App lives at `https://<user>.github.io/dinners_planner/`.
