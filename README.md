# Muyu: Invoice Generator

Server-rendered Node/Express app for creating invoice PDFs, saving invoice history by email, and preloading company defaults.

## Features

- Create invoices with business, customer, line item, and tax fields.
- Save invoices to PostgreSQL and download PDFs.
- View past invoices for the current email.
- Save company defaults in Settings.

## Requirements

- Node.js 24.16.0
- Docker and Docker Compose for local PostgreSQL
- Optional: `mise`, Trivy, Packer, ShellCheck

## Setup

Start the database:

```bash
docker compose up -d db
```

Run the app:

```bash
npm install
npm start
```

The app runs at `http://localhost:3000`.

With `mise`, this is equivalent:

```bash
mise run start
```

## Environment

| Variable | Description | Default |
| :--- | :--- | :--- |
| `DATABASE_URL` | PostgreSQL connection string | `postgres://invoice_user:invoice_pass@localhost:5432/invoice_db` |
| `PORT` | Application port | `3000` |
| `LOG_LEVEL` | Log verbosity | `info` |

## Development

```bash
npm run dev
npm run lint
npm test -- --runInBand
```

Database-backed tests use `invoice_test_db` on local port `5433`:

```bash
npm run test:db
```

## Stack

- Node.js, Express, EJS
- Alpine.js for small client-side interactions
- Plain CSS in `public/css`
- PostgreSQL via `pg`
- PDFKit
- Jest, Supertest, Biome

## Routes

- `GET /` - invoice form
- `POST /generate` - save invoice and download PDF
- `GET /past-invoices` - saved invoices for the current email
- `GET /download/:id` - download a saved invoice PDF
- `GET /settings` - company defaults
- `POST /settings` - save company defaults
- `GET /health` - health check

## Deployment

Build an AMI:

```bash
mise exec -- packer build provisioning/ami.pkr.hcl
```

Deploy on the instance:

```bash
cd /opt/muyu-invoice-generator
sudo ./scripts/deploy.sh
```

## Project Structure

```text
public/          Static CSS
src/services/    Database, PDF, calculations, logging
src/web.js       Express app and routes
tests/           Unit and integration tests
views/           EJS templates
```
