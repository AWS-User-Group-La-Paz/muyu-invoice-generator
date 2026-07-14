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
const { createLogger } = require("./services/logger");

let stopping = false;
let poolClosed = false;
let signalsRegistered = false;
let activePollController;
let processing;
let stopPromise;

const logger = createLogger("worker");
const logInfo = (event, message, fields = {}) =>
	logger.info({ event, ...fields }, message);
const logError = (event, message, error, fields = {}) =>
	logger.error(
		{ event, ...fields, errorCode: error?.code, err: error },
		message,
	);
const messageFields = (message) =>
	message?.MessageId ? { messageId: message.MessageId } : {};
const invoiceFields = (invoiceId, message, requestId) => ({
	invoiceId,
	...messageFields(message),
	...(requestId ? { requestId } : {}),
});

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

async function failInvoice(invoiceId, message, error, requestId) {
	logError(
		"invoice_failed",
		"Invoice failed",
		error,
		invoiceFields(invoiceId, message, requestId),
	);
	try {
		const failed = await markInvoiceFailed(invoiceId);
		if (failed) await deleteInvoice(message.ReceiptHandle);
	} catch (statusError) {
		logError(
			"invoice_failed_status_save_failed",
			"Invoice failure status save failed",
			statusError,
			invoiceFields(invoiceId, message, requestId),
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
			"Invoice job is malformed",
			error,
			messageFields(message),
		);
		await deleteInvoice(message.ReceiptHandle);
		return;
	}

	const { invoiceId, skipEmail, requestId } = job;
	logInfo(
		"invoice_received",
		"Invoice received",
		invoiceFields(invoiceId, message, requestId),
	);
	let invoice;
	try {
		invoice = await getInvoiceById(invoiceId);
	} catch (error) {
		await failInvoice(invoiceId, message, error, requestId);
		return;
	}
	if (!invoice) {
		logInfo(
			"invoice_stale_skipped",
			"Stale invoice skipped",
			invoiceFields(invoiceId, message, requestId),
		);
		await deleteInvoice(message.ReceiptHandle);
		return;
	}
	if (invoice.status !== "processing") {
		logInfo(
			"invoice_duplicate_skipped",
			"Duplicate invoice skipped",
			invoiceFields(invoiceId, message, requestId),
		);
		await deleteInvoice(message.ReceiptHandle);
		return;
	}

	try {
		const pdfBuffer = await generatePDF(invoice);
		logInfo(
			"invoice_pdf_generated",
			"Invoice PDF generated",
			invoiceFields(invoiceId, message, requestId),
		);
		const pdfKey = await storePDF(invoiceId, pdfBuffer);
		logInfo(
			"invoice_pdf_stored",
			"Invoice PDF stored",
			invoiceFields(invoiceId, message, requestId),
		);
		if (!skipEmail) {
			await sendInvoiceEmail({
				to: invoice.owner_email,
				invoiceId,
				pdfBuffer,
			});
			logInfo(
				"invoice_email_sent",
				"Invoice email sent",
				invoiceFields(invoiceId, message, requestId),
			);
		} else {
			logInfo(
				"invoice_email_skipped",
				"Invoice email skipped",
				invoiceFields(invoiceId, message, requestId),
			);
		}
		await markInvoiceComplete(invoiceId, pdfKey);
		logInfo(
			"invoice_completed",
			"Invoice completed",
			invoiceFields(invoiceId, message, requestId),
		);
		await deleteInvoice(message.ReceiptHandle);
	} catch (error) {
		await failInvoice(invoiceId, message, error, requestId);
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
			logError("worker_poll_failed", "Worker poll failed", error);
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
	logInfo("worker_starting", "Worker starting");
	try {
		validateEnvironment();
		await initDB();
		const queue = await checkQueue();
		logInfo("worker_subscribed", "Worker subscribed", { queue });
	} catch (error) {
		logError("worker_startup_failed", "Worker startup failed", error);
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
		logInfo("worker_signal", "Worker signal received", { signal });
		activePollController?.abort();
		if (processing) await processing;
		await closePool();
		logInfo("worker_stopped", "Worker stopped");
		process.exit(0);
	})();
	return stopPromise;
}

/* istanbul ignore next */
if (require.main === module) start();

module.exports = { start, processMessage, shutdown };
