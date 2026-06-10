const express = require("express");
const path = require("node:path");
const cookieParser = require("cookie-parser");
const { httpLogger, logger } = require("./services/logger");
const { calculateInvoice } = require("./services/calculations");
const {
	initDB,
	saveInvoice,
	getInvoicesByOwner,
	getInvoiceById,
	upsertProfile,
	getProfileByEmail,
	pool,
} = require("./services/db");
const { generatePDF } = require("./services/pdf");

const app = express();
const PORT = process.env.PORT || 3000;

// Helpers
const delay = (ms) => new Promise((res) => setTimeout(res, ms));

// Environment Validation
if (!process.env.DATABASE_URL && process.env.NODE_ENV !== "test") {
	console.error("FATAL: DATABASE_URL environment variable is not set.");
	process.exit(1);
}

// Middleware
app.use(httpLogger);
app.use(cookieParser());
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "../views"));
app.use(express.static(path.join(__dirname, "../public")));
app.use(express.urlencoded({ extended: true }));

// Routes
app.get("/health", (_req, res) => {
	res.status(200).json({ status: "OK", timestamp: new Date().toISOString() });
});

app.get("/", async (req, res) => {
	try {
		const email = req.cookies.user_email;
		let profile = null;
		if (email) {
			profile = await getProfileByEmail(email);
		}
		res.render("index", { profile });
	} catch (error) {
		logger.error("Error loading dashboard:", error);
		res.render("index", { profile: null });
	}
});

app.get("/past-invoices", async (req, res) => {
	try {
		const email = req.cookies.user_email;
		if (!email) {
			return res.redirect("/");
		}
		const invoices = await getInvoicesByOwner(email);
		res.render("past-invoices", { invoices, email });
	} catch (error) {
		logger.error("Error fetching past invoices:", error);
		res.status(500).send("An error occurred while fetching your history.");
	}
});

app.get("/settings", async (req, res) => {
	try {
		const email = req.cookies.user_email;
		if (!email) {
			return res.redirect("/");
		}
		const profile = await getProfileByEmail(email);
		res.render("settings", { profile, email });
	} catch (error) {
		logger.error("Error fetching settings:", error);
		res.status(500).send("An error occurred while fetching settings.");
	}
});

app.post("/settings", async (req, res) => {
	try {
		const email = req.cookies.user_email;
		if (!email) {
			return res.status(401).send("Unauthorized");
		}
		const { companyName, companyDetails, taxRate } = req.body;
		await upsertProfile({
			email,
			company_name: companyName,
			company_details: companyDetails,
			default_tax_rate: parseFloat(taxRate) || 0,
		});
		res.redirect("/settings?success=1");
	} catch (error) {
		logger.error("Error saving settings:", error);
		res.status(500).send("An error occurred while saving settings.");
	}
});

app.get("/download/:id", async (req, res) => {
	try {
		const email = req.cookies.user_email;
		const invoice = await getInvoiceById(req.params.id);

		if (!invoice) {
			return res.status(404).send("Invoice not found.");
		}

		if (invoice.owner_email !== email) {
			return res.status(403).send("Unauthorized to access this invoice.");
		}

		const pdfBuffer = await generatePDF(invoice);

		res.setHeader("Content-Type", "application/pdf");
		res.setHeader(
			"Content-Disposition",
			`attachment; filename=invoice-${invoice.id}.pdf`,
		);
		res.send(pdfBuffer);
	} catch (error) {
		logger.error("Error downloading invoice:", error);
		res.status(500).send("An error occurred while downloading the invoice.");
	}
});

app.post("/generate", async (req, res) => {
	try {
		const { companyName, companyDetails, taxRate, expenses } = req.body;
		const userEmail = req.cookies.user_email;

		if (!expenses) {
			return res.status(400).send("At least one expense is required.");
		}

		// Use the calculation service
		const invoiceData = calculateInvoice(expenses, taxRate);

		// Save to DB
		const invoice = await saveInvoice({
			companyName,
			companyDetails,
			owner_email: userEmail,
			...invoiceData,
		});

		// Generate PDF
		const pdfBuffer = await generatePDF(invoice);

		// Artificial delay for user feedback (only in non-test environments)
		if (process.env.NODE_ENV !== "test") {
			await delay(3000);
		}

		// Stream PDF response
		res.setHeader("Content-Type", "application/pdf");
		res.setHeader(
			"Content-Disposition",
			`attachment; filename=invoice-${invoice.id}.pdf`,
		);
		res.send(pdfBuffer);
	} catch (error) {
		logger.error("Error generating invoice:", error);
		res.status(500).send("An error occurred while generating the invoice.");
	}
});

// Lifecycle management
const shutdown = async () => {
	logger.info("Shutting down: closing database pool");
	await pool.end();
	process.exit(0);
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

// Start Server
async function start() {
	try {
		await initDB();
		app.listen(PORT, () => {
			logger.info(`Server is running on http://localhost:${PORT}`);
		});
	} catch (error) {
		logger.error("Failed to start server:", error);
		process.exit(1);
	}
}

/* istanbul ignore next */
if (require.main === module) {
	start();
}

module.exports = { app, shutdown, start };
