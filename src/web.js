const express = require("express");
const path = require("node:path");
const cookieParser = require("cookie-parser");
const { httpLogger } = require("./services/logger");
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

if (!process.env.DATABASE_URL && process.env.NODE_ENV !== "test") {
	console.error("FATAL: DATABASE_URL environment variable is not set.");
	process.exit(1);
}

app.use(httpLogger);
app.use(cookieParser());
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "../views"));
app.use(express.static(path.join(__dirname, "../public")));
app.use(express.urlencoded({ extended: true }));

const renderError = (res, status, title, message, email = "") =>
	res.status(status).render("error", { status, title, message, email });

app.get("/health", (_req, res) => {
	res.status(200).json({ status: "OK", timestamp: new Date().toISOString() });
});

app.get("/", async (req, res) => {
	try {
		const email = req.cookies.user_email;
		const profile = email ? await getProfileByEmail(email) : null;
		res.render("index", { profile });
	} catch (error) {
		console.error("Error loading dashboard:", error);
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
		console.error("Error fetching past invoices:", error);
		renderError(
			res,
			500,
			"Invoice history unavailable",
			"We could not load your saved invoices. Please try again.",
			req.cookies.user_email,
		);
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
		console.error("Error fetching settings:", error);
		renderError(
			res,
			500,
			"Settings unavailable",
			"We could not load your saved defaults. Please try again.",
			req.cookies.user_email,
		);
	}
});

app.post("/settings", async (req, res) => {
	try {
		const email = req.cookies.user_email;
		if (!email) {
			return renderError(
				res,
				401,
				"Email required",
				"Enter an email before saving invoice defaults.",
			);
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
		console.error("Error saving settings:", error);
		renderError(
			res,
			500,
			"Settings not saved",
			"We could not save your defaults. Your form values were not changed.",
			req.cookies.user_email,
		);
	}
});

app.get("/download/:id", async (req, res) => {
	try {
		const email = req.cookies.user_email;
		const invoice = await getInvoiceById(req.params.id);

		if (!invoice) {
			return renderError(
				res,
				404,
				"Invoice not found",
				"We could not find an invoice with that download link.",
				email,
			);
		}

		if (invoice.owner_email !== email) {
			return renderError(
				res,
				403,
				"Invoice unavailable",
				"This invoice belongs to a different email key.",
				email,
			);
		}

		const pdfBuffer = await generatePDF(invoice);

		res.setHeader("Content-Type", "application/pdf");
		res.setHeader(
			"Content-Disposition",
			`attachment; filename=invoice-${invoice.id}.pdf`,
		);
		res.send(pdfBuffer);
	} catch (error) {
		console.error("Error downloading invoice:", error);
		renderError(
			res,
			500,
			"Download failed",
			"We could not prepare this invoice PDF. Please try again.",
			req.cookies.user_email,
		);
	}
});

app.post("/generate", async (req, res) => {
	try {
		const {
			companyName,
			companyDetails,
			customerName,
			customerDetails,
			taxRate,
			expenses,
		} = req.body;
		const userEmail = req.cookies.user_email;

		if (!expenses) {
			return renderError(
				res,
				400,
				"Invoice missing line items",
				"Add at least one billable line item before generating a PDF.",
				userEmail,
			);
		}

		const invoiceData = calculateInvoice(expenses, taxRate);

		const invoice = await saveInvoice({
			companyName,
			companyDetails,
			customerName,
			customerDetails,
			owner_email: userEmail,
			...invoiceData,
		});

		const pdfBuffer = await generatePDF(invoice);

		res.setHeader("Content-Type", "application/pdf");
		res.setHeader(
			"Content-Disposition",
			`attachment; filename=invoice-${invoice.id}.pdf`,
		);
		res.send(pdfBuffer);
	} catch (error) {
		console.error("Error generating invoice:", error);
		renderError(
			res,
			500,
			"Invoice failed",
			"We could not save or generate the PDF. Your browser should still have the draft.",
			req.cookies.user_email,
		);
	}
});

const shutdown = async () => {
	console.log("Shutting down: closing database pool");
	await pool.end();
	process.exit(0);
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

async function start() {
	try {
		await initDB();
		app.listen(PORT, () => {
			console.log(`Server is running on http://localhost:${PORT}`);
		});
	} catch (error) {
		console.error("Failed to start server:", error);
		process.exit(1);
	}
}

/* istanbul ignore next */
if (require.main === module) {
	start();
}

module.exports = { app, shutdown, start };
