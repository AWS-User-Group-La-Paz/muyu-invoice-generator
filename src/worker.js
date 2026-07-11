const {
	initDB,
	getInvoiceById,
	markInvoiceComplete,
	markInvoiceFailed,
	pool,
} = require("./services/db");
const {
	checkQueue,
	receiveInvoice,
	deleteInvoice,
	validateInvoiceJob,
} = require("./services/queue");
const { generatePDF } = require("./services/pdf");
const { storePDF } = require("./services/storage");
const { sendInvoiceEmail } = require("./services/email");
const { logLine, quoted } = require("./services/logger");

let stopping = false;
let poolClosed = false;
let signalsRegistered = false;
let activePollController;
let processing;
let stopPromise;

const logInfo = (event, details) =>
	console.log(logLine("worker", "info", event, details));
const logError = (event, details) =>
	console.error(logLine("worker", "error", event, details));
const messageFields = (message) =>
	message?.MessageId ? `messageId=${message.MessageId}` : "";
const invoiceFields = (invoiceId, message) =>
	[`invoiceId=${invoiceId}`, messageFields(message)].filter(Boolean).join(" ");

function validateEnvironment() {
	const required = ["DATABASE_URL"];
	if (process.env.NODE_ENV === "production") {
		required.push("AWS_REGION", "SQS_QUEUE_URL", "S3_BUCKET", "EMAIL_FROM");
	}
	const missing = required.filter((name) => !process.env[name]);
	if (missing.length) {
		throw new Error(
			`Missing required environment variables: ${missing.join(", ")}`,
		);
	}
}

async function closePool() {
	if (poolClosed) return;
	poolClosed = true;
	await pool.end();
}

async function failInvoice(invoiceId, message, error) {
	logError(
		"invoice_failed",
		`${invoiceFields(invoiceId, message)} error=${quoted(error.message)}`,
	);
	try {
		const failed = await markInvoiceFailed(invoiceId);
		if (failed) await deleteInvoice(message.ReceiptHandle);
	} catch (statusError) {
		logError(
			"invoice_failed_status_save_failed",
			`${invoiceFields(invoiceId, message)} error=${quoted(statusError.message)}`,
		);
	}
}

async function processMessage(message) {
	let job;
	try {
		job = validateInvoiceJob(JSON.parse(message.Body));
	} catch (error) {
		logError(
			"invoice_job_malformed",
			[messageFields(message), `error=${quoted(error.message)}`]
				.filter(Boolean)
				.join(" "),
		);
		await deleteInvoice(message.ReceiptHandle);
		return;
	}

	const { invoiceId, skipEmail } = job;
	logInfo("invoice_received", invoiceFields(invoiceId, message));
	let invoice;
	try {
		invoice = await getInvoiceById(invoiceId);
	} catch (error) {
		await failInvoice(invoiceId, message, error);
		return;
	}
	if (!invoice) {
		logInfo("invoice_stale_skipped", invoiceFields(invoiceId, message));
		await deleteInvoice(message.ReceiptHandle);
		return;
	}
	if (invoice.status !== "processing") {
		logInfo("invoice_duplicate_skipped", invoiceFields(invoiceId, message));
		await deleteInvoice(message.ReceiptHandle);
		return;
	}

	try {
		const pdfBuffer = await generatePDF(invoice);
		logInfo("invoice_pdf_generated", invoiceFields(invoiceId, message));
		const pdfKey = await storePDF(invoiceId, pdfBuffer);
		logInfo("invoice_pdf_stored", invoiceFields(invoiceId, message));
		if (!skipEmail) {
			await sendInvoiceEmail({
				to: invoice.owner_email,
				invoiceId,
				pdfBuffer,
			});
			logInfo("invoice_email_sent", invoiceFields(invoiceId, message));
		} else {
			logInfo("invoice_email_skipped", invoiceFields(invoiceId, message));
		}
		await markInvoiceComplete(invoiceId, pdfKey);
		logInfo("invoice_completed", invoiceFields(invoiceId, message));
		await deleteInvoice(message.ReceiptHandle);
	} catch (error) {
		await failInvoice(invoiceId, message, error);
	}
}

async function poll() {
	while (!stopping) {
		activePollController = new AbortController();
		let message;
		try {
			message = await receiveInvoice({
				abortSignal: activePollController.signal,
			});
		} catch (error) {
			if (stopping && error.name === "AbortError") break;
			logError("worker_poll_failed", `error=${quoted(error.message)}`);
			await closePool();
			process.exit(1);
			return;
		} finally {
			activePollController = undefined;
		}

		if (message) {
			processing = processMessage(message);
			try {
				await processing;
			} finally {
				processing = undefined;
			}
		}
	}
}

function registerSignals() {
	if (signalsRegistered) return;
	signalsRegistered = true;
	process.on("SIGTERM", () => shutdown("SIGTERM"));
	process.on("SIGINT", () => shutdown("SIGINT"));
}

async function start() {
	registerSignals();
	logInfo("worker_starting");
	try {
		validateEnvironment();
		await initDB();
		const queue = await checkQueue();
		logInfo("worker_subscribed", `queue=${quoted(queue)}`);
	} catch (error) {
		logError("worker_startup_failed", `error=${quoted(error.message)}`);
		await closePool();
		process.exit(1);
		return;
	}
	await poll();
}

function shutdown(signal) {
	if (stopPromise) return stopPromise;
	stopPromise = (async () => {
		stopping = true;
		logInfo("worker_signal", `signal=${signal}`);
		activePollController?.abort();
		if (processing) await processing;
		await closePool();
		logInfo("worker_stopped");
		process.exit(0);
	})();
	return stopPromise;
}

/* istanbul ignore next */
if (require.main === module) start();

module.exports = { start, processMessage, shutdown };
