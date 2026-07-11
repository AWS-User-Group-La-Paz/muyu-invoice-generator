const { Pool } = require("pg");
const { logLine, quoted } = require("./logger");

const pool = new Pool({
	connectionString: process.env.DATABASE_URL,
});

pool.on("error", (err) => {
	console.error(
		logLine("db", "error", "idle_client_error", `error=${quoted(err.message)}`),
	);
});

async function query(text, params = []) {
	return pool.query(text, params);
}

async function initDB() {
	await query(`
		CREATE TABLE IF NOT EXISTS invoices (
			id SERIAL PRIMARY KEY,
			company_name TEXT NOT NULL,
			company_details TEXT,
			customer_name TEXT,
			customer_details TEXT,
			owner_email TEXT NOT NULL,
			tax_rate NUMERIC NOT NULL,
			subtotal NUMERIC NOT NULL,
			total NUMERIC NOT NULL,
			items JSONB NOT NULL,
			status TEXT NOT NULL DEFAULT 'processing'
				CHECK (status IN ('processing', 'complete', 'failed')),
			pdf_key TEXT,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
		);
	`);

	await query(
		`CREATE INDEX IF NOT EXISTS idx_invoices_owner ON invoices(owner_email);`,
	);

	await query(`
    CREATE TABLE IF NOT EXISTS user_profiles (
      email TEXT PRIMARY KEY,
      company_name TEXT,
      company_details TEXT,
      default_tax_rate NUMERIC,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

	console.log(logLine("db", "info", "database_initialized"));
}

async function saveInvoice(invoiceData) {
	const {
		companyName,
		companyDetails,
		customerName,
		customerDetails,
		taxRate,
		subtotal,
		total,
		items,
		owner_email,
	} = invoiceData;
	const result = await query(
		"INSERT INTO invoices (company_name, company_details, customer_name, customer_details, tax_rate, subtotal, total, items, owner_email) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *",
		[
			companyName,
			companyDetails,
			customerName || null,
			customerDetails || null,
			taxRate,
			subtotal,
			total,
			JSON.stringify(items),
			owner_email,
		],
	);

	const row = result.rows[0];
	return row;
}

async function getInvoicesByOwner(email) {
	const result = await query(
		"SELECT * FROM invoices WHERE owner_email = $1 ORDER BY created_at DESC",
		[email],
	);
	return result.rows;
}

async function getInvoiceById(id) {
	const result = await query("SELECT * FROM invoices WHERE id = $1", [id]);
	return result.rows[0];
}

async function markInvoiceComplete(id, pdfKey) {
	const result = await query(
		"UPDATE invoices SET status = 'complete', pdf_key = $2 WHERE id = $1 AND status = 'processing' RETURNING *",
		[id, pdfKey],
	);
	return result.rows[0];
}

async function markInvoiceFailed(id) {
	const result = await query(
		"UPDATE invoices SET status = 'failed' WHERE id = $1 AND status = 'processing' RETURNING *",
		[id],
	);
	return result.rows[0];
}

async function upsertProfile(profileData) {
	const { email, company_name, company_details, default_tax_rate } =
		profileData;

	const result = await query(
		`INSERT INTO user_profiles (email, company_name, company_details, default_tax_rate, updated_at)
	     VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
     ON CONFLICT (email) DO UPDATE SET
       company_name = EXCLUDED.company_name,
       company_details = EXCLUDED.company_details,
       default_tax_rate = EXCLUDED.default_tax_rate,
       updated_at = CURRENT_TIMESTAMP
     RETURNING *`,
		[email, company_name, company_details, default_tax_rate],
	);
	return result.rows[0];
}

async function getProfileByEmail(email) {
	const result = await query("SELECT * FROM user_profiles WHERE email = $1", [
		email,
	]);
	return result.rows[0] || null;
}

module.exports = {
	pool,
	query,
	initDB,
	saveInvoice,
	getInvoicesByOwner,
	getInvoiceById,
	markInvoiceComplete,
	markInvoiceFailed,
	upsertProfile,
	getProfileByEmail,
};
