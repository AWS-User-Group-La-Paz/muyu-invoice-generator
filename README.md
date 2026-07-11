# Muyu: Invoice Generator

Server-rendered Node/Express invoice app with asynchronous PDF generation.

## Architecture

The web process validates and saves an invoice as `processing`, then sends its ID to SQS and returns HTTP `202`. A separate worker loads the invoice from PostgreSQL, generates the PDF, stores it, emails it, marks the invoice `complete`, and deletes the queue message.

Both processes use the same image:

- Web: `node src/web.js`
- Worker: `node src/worker.js`

Production uses AWS SQS, S3, and SES. Any other `NODE_ENV` uses LocalStack SQS, `tmp/pdfs/`, and Mailpit.

## Invoice states

- `processing`: queued or currently running.
- `complete`: stored, emailed, and available to download.
- `failed`: the handled workflow did not finish.

SQS delivery is at least once. A crash before message deletion can repeat storage or email side effects. Handled failures are terminal and delete the message after the Failed state is saved. Storage or email may already have succeeded when a later step fails. Messages have a fixed five-minute visibility timeout with no application heartbeat or retry policy.

## Requirements

- Node.js 24.16.0
- Docker and Docker Compose
- Optional: `mise`, Trivy

## Local setup

Install dependencies and start PostgreSQL, LocalStack, and Mailpit:

```bash
npm install
mise run local-setup
```

Run the web process and worker in separate terminals:

```bash
mise run dev
mise run dev-worker
```

Without mise, use `docker compose up -d --wait db localstack mailpit`, create the `invoice-pdf-jobs` queue with `awslocal`, then run `npm run dev` and `npm run dev:worker`.

- App: `http://localhost:3000`
- Mailpit: `http://localhost:8025`

The database schema is final-state startup DDL, not a migration chain. Recreate local resources after schema changes:

```bash
mise run local-reset
```

This intentionally destroys local database data, queue messages, and Compose volumes.

## Commands

```bash
npm start
npm run dev
npm run worker
npm run dev:worker
npm run lint
npm test -- --runInBand
```

The test suite mocks PostgreSQL and AWS/email boundaries. It requires no PostgreSQL, LocalStack, Mailpit, AWS account, or Docker daemon.

## Environment

Local development defaults live in `mise.toml` and the service modules.

| Variable | Process | Required in production | Purpose |
| :--- | :--- | :--- | :--- |
| `NODE_ENV` | Both | Yes | `production` selects AWS; every other value selects local services |
| `DATABASE_URL` | Both | Yes | PostgreSQL connection string |
| `AWS_REGION` | Both | Yes | SQS, S3, and SES region |
| `SQS_QUEUE_URL` | Both | Yes | Invoice job queue |
| `S3_BUCKET` | Both | Yes | Private PDF bucket |
| `EMAIL_FROM` | Worker | Yes | Verified SES sender |
| `PORT` | Web | No | HTTP port, default `3000` |

AWS credentials come from the normal SDK credential provider chain and assigned IAM roles. The application contains no access keys.

## Production permissions

Web role:

- `sqs:SendMessage` on the invoice queue.
- `s3:GetObject` on the bucket's `invoices/` prefix.

Worker role:

- `sqs:GetQueueAttributes`, `sqs:ReceiveMessage`, and `sqs:DeleteMessage` on the invoice queue.
- `s3:PutObject` on the bucket's `invoices/` prefix.
- `ses:SendEmail` for the configured sender identity.

`EMAIL_FROM` must be a verified SES identity in `AWS_REGION`. While SES is in sandbox mode, recipients must also be verified. Because the editable email cookie is a data key rather than authentication, production must remain private/restricted or intentionally remain in the SES sandbox; this app must not become a public mail relay.

## Routes

- `GET /` — invoice form.
- `POST /generate` — validate, save, enqueue, and return `202` JSON.
- `GET /past-invoices` — invoice history and status.
- `GET /download/:id` — stream a stored Complete PDF.
- `GET /settings` — company defaults.
- `POST /settings` — save company defaults.
- `GET /health` — web-process liveness.

## Manual smoke run

1. Run `mise run local-reset`.
2. Start `mise run dev` and `mise run dev-worker` in separate terminals.
3. Submit an invoice; confirm `POST /generate` returns `202` and history shows Processing.
4. Confirm worker logs show PDF generation, storage, email, and completion.
5. Open `http://localhost:8025` and verify the PDF attachment.
6. Refresh history, confirm Complete, and download the stored PDF.
7. Stop the worker during an empty long poll and confirm it logs a clean shutdown.

## Deliberate limits

There is no DLQ, outbox, browser polling, WebSocket status feed, custom retry loop, migration framework, failed-job recovery UI, presigned URL, public S3 object, separate worker image, email template system, or PDF cleanup job.
