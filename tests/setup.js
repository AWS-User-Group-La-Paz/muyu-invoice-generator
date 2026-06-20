const port = process.env.CI ? "5432" : "5433";

process.env.DATABASE_URL = `postgres://invoice_user:invoice_pass@localhost:${port}/invoice_test_db`;
