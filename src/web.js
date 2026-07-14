const express = require("express");
const path = require("node:path");
const { pipeline } = require("node:stream/promises");
const cookieParser = require("cookie-parser");
const { createLogger } = require("./services/logger");
const { calculateInvoice } = require("./services/calculations");
const {
	initDB,
	saveInvoice,
	getInvoicesByOwner,
	getInvoiceById,
	markInvoiceFailed,
	upsertProfile,
	getProfileByEmail,
	pool,
} = require("./services/db");
const { createInvoiceJob, enqueueInvoice } = require("./services/queue");
const { openPDF } = require("./services/storage");

const app = express();
app.set("trust proxy", 1);
const PORT = process.env.PORT || 3000;
const logger = createLogger("web");
const logInfo = (event, message, fields = {}) =>
	logger.info({ event, ...fields }, message);
const logError = (event, message, error, fields = {}) =>
	logger.error(
		{ event, ...fields, errorCode: error?.code, err: error },
		message,
	);

if (process.env.NODE_ENV !== "test") {
	const required = ["DATABASE_URL"];
	if (process.env.NODE_ENV === "production") {
		required.push("AWS_REGION", "SQS_QUEUE_URL", "S3_BUCKET");
	}
	const missing = required.filter((name) => !process.env[name]);
	if (missing.length) {
		logger.error(
			{ event: "missing_environment", missing },
			"Required environment variables are missing",
		);
		process.exit(1);
	}
}

app.use((req, res, next) => {
	const startedAt = process.hrtime.bigint();
	res.on("finish", () => {
		logger.info(
			{
				event: "http_request",
				method: req.method,
				path: req.path,
				status: res.statusCode,
				durationMs: Number(process.hrtime.bigint() - startedAt) / 1e6,
			},
			"HTTP request completed",
		);
	});
	next();
});
app.use(cookieParser());
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "../views"));
app.use(express.static(path.join(__dirname, "../public")));
app.use(express.urlencoded({ extended: true }));

const renderError = (res, status, title, message, email = "") =>
	res.status(status).render("error", { status, title, message, email });

const validInvoiceRequest = ({ companyName, taxRate, expenses }) => {
	if (
		typeof companyName !== "string" ||
		!companyName.trim() ||
		!Array.isArray(expenses) ||
		!expenses.length
	) {
		return false;
	}
	if (
		expenses.some((item) => {
			if (!item || typeof item.description !== "string") return true;
			const { description, cost } = item;
			const number = Number(cost);
			return (
				!description.trim() ||
				cost == null ||
				String(cost).trim() === "" ||
				!Number.isFinite(number) ||
				number < 0
			);
		})
	) {
		return false;
	}
	const number = Number(taxRate);
	return (
		taxRate != null &&
		String(taxRate).trim() !== "" &&
		Number.isFinite(number) &&
		number >= 0 &&
		number <= 100
	);
};

app.get("/health", (_req, res) => {
	res.status(200).json({ status: "OK", timestamp: new Date().toISOString() });
});

app.get("/", async (req, res) => {
	try {
		const email = req.cookies.user_email;
		const profile = email ? await getProfileByEmail(email) : null;
		res.render("index", { profile });
	} catch (error) {
		logError("dashboard_load_failed", "Dashboard load failed", error);
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
		logError("past_invoices_load_failed", "Invoice history load failed", error);
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
		logError("settings_load_failed", "Settings load failed", error);
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
		logError("settings_save_failed", "Settings save failed", error);
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

		if (invoice.status !== "complete" || !invoice.pdf_key) {
			return renderError(
				res,
				409,
				"Invoice not ready",
				"This invoice PDF is not available for download.",
				email,
			);
		}

		const pdfStream = await openPDF(invoice.pdf_key);

		res.setHeader("Content-Type", "application/pdf");
		res.setHeader(
			"Content-Disposition",
			`attachment; filename=invoice-${invoice.id}.pdf`,
		);
		await pipeline(pdfStream, res);
	} catch (error) {
		logError("invoice_download_failed", "Invoice download failed", error, {
			invoiceId: req.params.id,
		});
		if (res.headersSent) {
			res.destroy(error);
			return;
		}
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
	const userEmail = req.cookies.user_email;
	if (!userEmail) {
		return res.status(401).json({ error: "Email required" });
	}
	if (!validInvoiceRequest(req.body)) {
		return res.status(400).json({ error: "Invalid invoice" });
	}

	const {
		companyName,
		companyDetails,
		customerName,
		customerDetails,
		taxRate,
		expenses,
	} = req.body;
	const invoiceData = calculateInvoice(expenses, taxRate);
	let invoice;
	try {
		invoice = await saveInvoice({
			companyName,
			companyDetails,
			customerName,
			customerDetails,
			owner_email: userEmail,
			...invoiceData,
		});
	} catch (error) {
		logError("invoice_save_failed", "Invoice save failed", error);
		return res.status(500).json({ error: "Invoice not saved" });
	}

	try {
		const job = createInvoiceJob(invoice, req.body.skipEmail === "true");
		const queued = await enqueueInvoice(job);
		logInfo("invoice_queued", "Invoice queued", {
			invoiceId: invoice.id,
			...(queued?.MessageId ? { messageId: queued.MessageId } : {}),
		});
		return res.status(202).json({ id: invoice.id, status: "processing" });
	} catch (error) {
		logError("invoice_enqueue_failed", "Invoice enqueue failed", error, {
			invoiceId: invoice.id,
		});
		try {
			await markInvoiceFailed(invoice.id);
		} catch (statusError) {
			logError(
				"invoice_failed_status_save_failed",
				"Invoice failure status save failed",
				statusError,
				{ invoiceId: invoice.id },
			);
		}
		return res.status(500).json({ error: "Invoice not queued" });
	}
});

let shutdownPromise;
const shutdown = (signal = "shutdown") => {
	if (shutdownPromise) return shutdownPromise;
	shutdownPromise = (async () => {
		logInfo("shutdown", "Web process shutting down", { signal });
		await pool.end();
		process.exit(0);
	})();
	return shutdownPromise;
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

async function start() {
	try {
		await initDB();
		app.listen(PORT, () => {
			logInfo("server_started", "Web server started", { port: PORT });
		});
	} catch (error) {
		logError("server_start_failed", "Web server start failed", error);
		process.exit(1);
	}
}

/* istanbul ignore next */
if (require.main === module) {
	start();
}

module.exports = { app, shutdown, start };
