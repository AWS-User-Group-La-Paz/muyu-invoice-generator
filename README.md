# Muyu: Invoice Generator

A lightweight, server-side rendered (SSR) application built with Node.js and Express for generating and managing business invoices. 

## Prerequisites

Before running the application, ensure you have the following tools installed:

- **Node.js**: v24.16.0 (Environment managed via [mise](https://mise.jdx.dev/))
- **Docker & Docker Compose**: Required for containerized database orchestration.
- **Trivy**: (Optional) For dependency security scanning.

## Tech Stack

- **Backend**: Node.js, Express.js
- **Tooling**: Biome (Linter/Formatter)
- **Templating**: EJS
- **Frontend Interactivity**: Alpine.js (Lightweight reactive state)
- **Styling**: Tailwind CSS (Pre-compiled)
- **Database**: PostgreSQL (via `pg` client)
- **PDF Generation**: PDFKit (Streamed responses)
- **Security**: Helmet.js (CSP and Secure Headers)
- **Logging**: Morgan (Human-readable, searchable text logs)

## Getting Started

### 1. Database Setup
Launch the containerized PostgreSQL instance in the background:
```bash
docker-compose up -d
```

### 2. Environment Configuration
The application requires the following environment variables. These are pre-configured in `mise.toml` for local development.

| Variable | Description | Default |
| :--- | :--- | :--- |
| `DATABASE_URL` | PostgreSQL connection string | `postgres://invoice_user:invoice_pass@localhost:5432/invoice_db` |
| `PORT` | Application server port | `3000` |
| `LOG_LEVEL` | Logging verbosity (info, warn, error) | `info` |

### 3. Application Startup
Use `mise` to automatically install dependencies and launch the server:
```bash
mise run start
```
The application will be accessible at `http://localhost:3000`.

## Development & Quality Control

### Local Development
Run the server with automatic restarts enabled (Node.js watch mode):
```bash
npm run dev
```

### Running Tests
The project enforces high code coverage (>80%) for all backend logic and routes using Jest:
```bash
npm test
```

### Linting & Formatting
The project uses Biome for blazing-fast, zero-config linting and code formatting:
```bash
mise run lint    # Check for linting errors and formatting issues
mise run format  # Automatically fix linting errors and format code
```

### Security Scanning
Verify the security of project dependencies using the integrated Trivy task:
```bash
mise run scan-dependencies
```

## Production Deployment

This application is designed to be deployed natively on an AWS EC2 instance without container orchestration. We use HashiCorp Packer to build a fully configured Amazon Machine Image (AMI).

### 1. Building the EC2 Image (AMI)
To bake a fresh AMI containing Node.js, Nginx, PostgreSQL, and the application code, ensure you have AWS credentials exported in your terminal, then run:
```bash
mise exec -- packer build provisioning/ami.pkr.hcl
```
This will output an AMI ID (e.g., `ami-0abcdef1234567890`) which you can use to launch an EC2 instance.

### 2. Deploying New Versions
Once your EC2 instance is running, you can pull new code and restart the service without having to rebuild the AMI from scratch.

SSH into your EC2 instance, navigate to the application directory, and run the deployment script:
```bash
cd /opt/muyu-invoice-generator
sudo ./scripts/deploy.sh
```
This script pulls the latest code from the `master` branch, cleanly installs dependencies, and restarts the `muyu-invoice` systemd service with zero downtime managed natively by Linux.

## Project Structure

```text
├── public/          # Static assets (CSS, browser scripts)
├── src/
│   ├── services/    # Business logic (DB, PDF, Calculations, Logging)
│   └── web.js       # Express application entry, middleware, and routing
├── tests/           # Unit and Integration test suites
└── views/           # EJS templates for the user interface
```

## API Endpoints

- **`GET /`**: Main dashboard and invoice generation form.
- **`GET /health`**: System health check; returns status and ISO timestamp.
- **`POST /generate`**: Validates invoice data, saves metadata to the database, and initiates a PDF download.
