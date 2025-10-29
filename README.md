# Country, Currency & Exchange API

A Node.js REST API that fetches country metadata and USD exchange rates from external sources, stores a normalized view in a relational database, and exposes endpoints to query, manage, and visualize summary data as a generated image.

## Overview
- Fetches country info from `restcountries` and USD exchange rates from `open.er-api`.
- Writes/updates a single table `countries_table` with idempotent upserts.
- Computes a synthetic `estimated_gdp` from population and exchange rates for simple ranking purposes.
- Serves a generated summary image at `backend-service/cache/summary.png` and via an endpoint.

## Architecture
- Backend: `Express` server in `backend-service/`
- DB: MySQL-compatible (e.g., MySQL, MariaDB, PlanetScale)
- HTTP client: `node-fetch` with request timeouts
- Image generation: primary path uses Jimp bitmap fonts; optionally Sharp+SVG if available
- Caching: persisted in DB; image file written to `backend-service/cache/summary.png`

Directory layout (key files):
- `backend-service/app.js` – Express app wiring and middleware
- `backend-service/server.js` – boots the HTTP server and DB connection
- `backend-service/db/connectdb.js` – DB pool creation/connection
- `backend-service/routes/route.js` – routes
- `backend-service/controller/controller.js` – handlers and image generation
- `backend-service/cache/summary.png` – generated image output

## Requirements
- Node.js: 16+ supported via Jimp-only image path. If you want Sharp-based rendering, use Node >= 18.17.0
- MySQL-compatible database

## Setup
1) Create `.env` in `backend-service/`:
```
PORT=3000
DB_HOST=your-host
DB_PORT=3306
DB_USER=your-user
DB_PASSWORD=your-password
DB_DATABASE_NAME=your-db
# Optional if your DB requires TLS
DB_CERT="-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----\n"
```

2) Install and run
```
cd backend-service
npm install
npm run dev
# or: npm start
```

3) (Optional) Install Sharp for higher-quality text rendering (Node >= 18.17.0 required):
```
cd backend-service
npm i sharp
```

## Running
- Start the server: it will create the `countries_table` on demand.
- First call to refresh endpoint will populate data and generate the image.

## Data Model (countries_table)
- `id`: INT AUTO_INCREMENT PRIMARY KEY
- `name`: VARCHAR(100) UNIQUE
- `capital`: VARCHAR(100) | nullable
- `region`: VARCHAR(100) | nullable
- `population`: BIGINT
- `currency_code`: VARCHAR(10) | nullable
- `exchange_rate`: DOUBLE | nullable (rate of 1 currency unit in USD base context)
- `estimated_gdp`: DOUBLE | nullable (synthetic, see below)
- `flag_url`: TEXT | nullable
- `last_refreshed_at`: BIGINT (ms since epoch)

### Estimated GDP rule
- If a country has no currency: `estimated_gdp = 0`
- If a country has a currency but its rate is missing: `estimated_gdp = null`
- Else: `estimated_gdp = population * multiplier / exchange_rate`, where `multiplier ∈ [1000, 2000)` for variability

## API Endpoints
Base URL: `http://localhost:PORT`

- POST `/countries/refresh`
  - Fetches external data, upserts rows, generates summary image.
  - Returns JSON with `message`, `total`, `last_refreshed_at`.

- GET `/countries`
  - Optional filters: `region`, `currency`
  - Optional sorting: `sort` ∈ { `gdp_desc`, `gdp_asc` }
  - Returns array of rows
  - Validation: non-string `region`/`currency`, or invalid `sort` => 400 with JSON error

- GET `/countries/:name`
  - Case-insensitive name lookup
  - 404 if not found

- DELETE `/countries/:name`
  - Deletes row by name (case-insensitive)
  - 404 if not found

- GET `/status`
  - Returns `{ total_countries, last_refreshed_at }`

- GET `/countries/image`
  - Streams `backend-service/cache/summary.png` as `image/png`

## Examples
Refresh data and image:
```
curl -X POST http://localhost:3000/countries/refresh
```

List countries in Africa, sorted by estimated GDP descending:
```
curl "http://localhost:3000/countries?region=Africa&sort=gdp_desc"
```

Get one country:
```
curl http://localhost:3000/countries/Nigeria
```

Fetch the summary image:
```
curl -I http://localhost:3000/countries/image
# or open directly
open backend-service/cache/summary.png
```

## Validation & Error Responses
- Validation failures use the consistent shape:
```
{
  "error": "Validation failed",
  "details": { "field": "reason" }
}
```
- External data fetch failures time out and return 503 without DB mutation.
- Not found responses (e.g., country by name) return:
```
{ "error": "Country not found" }
```

## Summary Image Generation
- Output path: `backend-service/cache/summary.png`
- Content:
  - Title
  - Total number of countries
  - Timestamp of last refresh (ISO)
  - Top 5 countries by estimated GDP

### Rendering paths
- Default: Jimp bitmap fonts (works on Node 16+)
- Optional: Sharp + inline SVG text (if Sharp is installed and Node is >= 18.17.0)

## Troubleshooting
- Summary image 404
  - Ensure you POST `/countries/refresh` first
  - Check server logs for image generation errors

- “Sharp module cannot load”
  - Upgrade Node to >= 18.17.0 or uninstall Sharp and rely on Jimp

- Jimp font errors
  - The project resolves bitmap fonts from `node_modules`. Run `npm install` in `backend-service/`

- “Country not found” on refresh
  - Make sure you use POST `/countries/refresh`. A GET to `/countries/refresh` is routed to `/countries/:name`.

## Development
- Code formatting and style: keep names descriptive and prefer early returns.
- Long-running tasks: the refresh is network-bound and uses a request timeout.
- Non-fatal image generation errors are logged but do not fail the refresh request.

## License
See `LICENSE`.
