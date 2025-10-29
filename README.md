# Country-Currency-and-Exchange-API
A RESTful API that fetches country data from an external API, stores it in a database, and provides CRUD operations.

## Setup

1. Create `.env` in `backend-service/`:

```
PORT=3000
DB_HOST=your-host
DB_PORT=3306
DB_USER=your-user
DB_PASSWORD=your-password
DB_DATABASE_NAME=your-db
DB_CERT="-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----\n"
```

2. Install and run

```
cd backend-service
npm install
npm run dev
```

## Endpoints

- POST `/countries/refresh` — fetch countries and exchange rates, cache in DB and generate image
- GET `/countries` — list countries with optional filters: `?region=Africa` `?currency=NGN` `?sort=gdp_desc`
- GET `/countries/:name` — get one country by name
- DELETE `/countries/:name` — delete a country
- GET `/status` — shows total countries and last refresh timestamp
- GET `/countries/image` — serves generated image at `cache/summary.png`

## Notes
- Only updates cache on refresh.
- If currency absent, `currency_code` and `exchange_rate` are null and `estimated_gdp` is 0; if code not found in rates, `exchange_rate` and `estimated_gdp` are null.
- External API timeouts return 503 without mutating DB.
