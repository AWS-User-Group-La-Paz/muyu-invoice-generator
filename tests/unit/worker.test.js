const mockInitDB = jest.fn();
const mockGetInvoiceById = jest.fn();
const mockMarkInvoiceComplete = jest.fn();
const mockMarkInvoiceFailed = jest.fn();
const mockPoolEnd = jest.fn();
const mockCheckQueue = jest.fn();
const mockReceiveInvoice = jest.fn();
const mockDeleteInvoice = jest.fn();
const mockGeneratePDF = jest.fn();
const mockStorePDF = jest.fn();
const mockSendInvoiceEmail = jest.fn();
const mockLogInfo = jest.fn();
const mockLogError = jest.fn();

jest.mock("../../src/services/db", () => ({
	initDB: mockInitDB,
	getInvoiceById: mockGetInvoiceById,
	markInvoiceComplete: mockMarkInvoiceComplete,
	markInvoiceFailed: mockMarkInvoiceFailed,
	pool: { end: mockPoolEnd },
}));
jest.mock("../../src/services/queue", () => ({
	checkQueue: mockCheckQueue,
	receiveInvoice: mockReceiveInvoice,
	deleteInvoice: mockDeleteInvoice,
	validateInvoiceJob: jest.fn((job) => {
		if (!Number.isInteger(job?.invoiceId) || job.invoiceId <= 0) {
			throw new TypeError("invalid job");
		}
		return job;
	}),
}));
jest.mock("../../src/services/pdf", () => ({ generatePDF: mockGeneratePDF }));
jest.mock("../../src/services/storage", () => ({ storePDF: mockStorePDF }));
jest.mock("../../src/services/email", () => ({
	sendInvoiceEmail: mockSendInvoiceEmail,
}));
jest.mock("../../src/services/logger", () => ({
	createLogger: jest.fn(() => ({ info: mockLogInfo, error: mockLogError })),
}));

const message = (body = { invoiceId: 7 }) => ({
	Body: typeof body === "string" ? body : JSON.stringify(body),
	MessageId: "message-7",
	ReceiptHandle: "receipt-7",
});

describe("invoice worker", () => {
	let worker;
	let exitSpy;

	beforeEach(() => {
		jest.resetModules();
		jest.clearAllMocks();
		process.env.NODE_ENV = "test";
		process.env.DATABASE_URL = "postgres://test";
		exitSpy = jest.spyOn(process, "exit").mockImplementation(() => {});
		mockInitDB.mockResolvedValue();
		mockCheckQueue.mockResolvedValue("local-queue");
		mockPoolEnd.mockResolvedValue();
		mockDeleteInvoice.mockResolvedValue();
		worker = require("../../src/worker");
	});

	afterEach(() => jest.restoreAllMocks());

	test("generates, stores, emails, completes, and deletes in order", async () => {
		const invoice = {
			id: 7,
			owner_email: "author@example.com",
			status: "processing",
		};
		const pdf = Buffer.from("pdf");
		mockGetInvoiceById.mockResolvedValue(invoice);
		mockGeneratePDF.mockResolvedValue(pdf);
		mockStorePDF.mockResolvedValue("invoices/7.pdf");
		mockSendInvoiceEmail.mockResolvedValue();
		mockMarkInvoiceComplete.mockResolvedValue({
			...invoice,
			status: "complete",
		});

		await worker.processMessage(
			message({ invoiceId: 7, requestId: "request-7" }),
		);

		expect(mockGeneratePDF).toHaveBeenCalledWith(invoice);
		expect(mockStorePDF).toHaveBeenCalledWith(7, pdf);
		expect(mockSendInvoiceEmail).toHaveBeenCalledWith({
			to: "author@example.com",
			invoiceId: 7,
			pdfBuffer: pdf,
		});
		expect(mockMarkInvoiceComplete).toHaveBeenCalledWith(7, "invoices/7.pdf");
		expect(mockDeleteInvoice).toHaveBeenCalledWith("receipt-7");
		expect(mockGeneratePDF.mock.invocationCallOrder[0]).toBeLessThan(
			mockStorePDF.mock.invocationCallOrder[0],
		);
		expect(mockStorePDF.mock.invocationCallOrder[0]).toBeLessThan(
			mockSendInvoiceEmail.mock.invocationCallOrder[0],
		);
		expect(mockSendInvoiceEmail.mock.invocationCallOrder[0]).toBeLessThan(
			mockMarkInvoiceComplete.mock.invocationCallOrder[0],
		);
		expect(mockLogInfo).toHaveBeenCalledWith(
			{
				event: "invoice_completed",
				invoiceId: 7,
				messageId: "message-7",
				requestId: "request-7",
			},
			"Invoice completed",
		);
	});

	test("generates and stores without emailing when requested", async () => {
		const invoice = {
			id: 7,
			owner_email: "author@example.com",
			status: "processing",
		};
		const pdf = Buffer.from("pdf");
		mockGetInvoiceById.mockResolvedValue(invoice);
		mockGeneratePDF.mockResolvedValue(pdf);
		mockStorePDF.mockResolvedValue("invoices/7.pdf");
		mockMarkInvoiceComplete.mockResolvedValue({
			...invoice,
			status: "complete",
		});

		await worker.processMessage(message({ invoiceId: 7, skipEmail: true }));

		expect(mockSendInvoiceEmail).not.toHaveBeenCalled();
		expect(mockLogInfo).toHaveBeenCalledWith(
			{
				event: "invoice_email_skipped",
				invoiceId: 7,
				messageId: "message-7",
			},
			"Invoice email skipped",
		);
		expect(mockMarkInvoiceComplete).toHaveBeenCalledWith(7, "invoices/7.pdf");
		expect(mockDeleteInvoice).toHaveBeenCalledWith("receipt-7");
	});

	test("marks a processing failure as failed before deleting", async () => {
		mockGetInvoiceById.mockResolvedValue({ id: 7, status: "processing" });
		mockGeneratePDF.mockRejectedValue(new Error("render failed"));
		mockMarkInvoiceFailed.mockResolvedValue({ id: 7, status: "failed" });

		await worker.processMessage(message());

		expect(mockMarkInvoiceFailed).toHaveBeenCalledWith(7);
		expect(mockDeleteInvoice).toHaveBeenCalledWith("receipt-7");
		expect(mockLogError).toHaveBeenCalledWith(
			expect.objectContaining({
				event: "invoice_failed",
				invoiceId: 7,
				messageId: "message-7",
				err: expect.objectContaining({ message: "render failed" }),
			}),
			"Invoice failed",
		);
	});

	test("handles an invoice lookup failure as a processing failure", async () => {
		mockGetInvoiceById.mockRejectedValue(new Error("database unavailable"));
		mockMarkInvoiceFailed.mockResolvedValue({ id: 7, status: "failed" });

		await worker.processMessage(message());

		expect(mockMarkInvoiceFailed).toHaveBeenCalledWith(7);
		expect(mockDeleteInvoice).toHaveBeenCalledWith("receipt-7");
	});

	test("keeps the message when failed status cannot be persisted", async () => {
		mockGetInvoiceById.mockResolvedValue({ id: 7, status: "processing" });
		mockGeneratePDF.mockRejectedValue(new Error("render failed"));
		mockMarkInvoiceFailed.mockRejectedValue(new Error("database unavailable"));

		await worker.processMessage(message());

		expect(mockDeleteInvoice).not.toHaveBeenCalled();
	});

	test.each([
		["stale", null],
		["duplicate", { id: 7, status: "complete" }],
	])("deletes a %s job without processing it", async (_name, invoice) => {
		mockGetInvoiceById.mockResolvedValue(invoice);

		await worker.processMessage(message());

		expect(mockGeneratePDF).not.toHaveBeenCalled();
		expect(mockDeleteInvoice).toHaveBeenCalledWith("receipt-7");
	});

	test("deletes a malformed message", async () => {
		await worker.processMessage(message("not-json"));

		expect(mockGetInvoiceById).not.toHaveBeenCalled();
		expect(mockDeleteInvoice).toHaveBeenCalledWith("receipt-7");
	});

	test("logs startup and exits nonzero when polling fails", async () => {
		mockReceiveInvoice.mockRejectedValue(new Error("queue unavailable"));

		await worker.start();

		expect(mockLogInfo).toHaveBeenCalledWith(
			{ event: "worker_starting" },
			"Worker starting",
		);
		expect(mockLogInfo).toHaveBeenCalledWith(
			{ event: "worker_subscribed", queue: "local-queue" },
			"Worker subscribed",
		);
		expect(mockLogError).toHaveBeenCalledWith(
			expect.objectContaining({
				event: "worker_poll_failed",
				err: expect.objectContaining({ message: "queue unavailable" }),
			}),
			"Worker poll failed",
		);
		expect(mockPoolEnd).toHaveBeenCalledTimes(1);
		expect(exitSpy).toHaveBeenCalledWith(1);
	});

	test("exits nonzero when queue subscription fails", async () => {
		mockCheckQueue.mockRejectedValue(new Error("missing queue"));

		await worker.start();

		expect(mockLogError).toHaveBeenCalledWith(
			expect.objectContaining({
				event: "worker_startup_failed",
				err: expect.objectContaining({ message: "missing queue" }),
			}),
			"Worker startup failed",
		);
		expect(mockPoolEnd).toHaveBeenCalledTimes(1);
		expect(exitSpy).toHaveBeenCalledWith(1);
	});

	test("registers both signals and aborts a long poll during clean shutdown", async () => {
		const handlers = {};
		jest.spyOn(process, "on").mockImplementation((signal, handler) => {
			handlers[signal] = handler;
			return process;
		});
		mockReceiveInvoice.mockImplementation(
			({ abortSignal }) =>
				new Promise((_resolve, reject) => {
					abortSignal.addEventListener("abort", () => {
						const error = new Error("aborted");
						error.name = "AbortError";
						reject(error);
					});
				}),
		);

		const running = worker.start();
		await new Promise(setImmediate);
		await handlers.SIGTERM();
		await running;

		expect(handlers.SIGINT).toEqual(expect.any(Function));
		expect(mockReceiveInvoice.mock.calls[0][0].abortSignal.aborted).toBe(true);
		expect(mockPoolEnd).toHaveBeenCalledTimes(1);
		expect(mockLogInfo).toHaveBeenCalledWith(
			{ event: "worker_signal", signal: "SIGTERM" },
			"Worker signal received",
		);
		expect(mockLogInfo).toHaveBeenCalledWith(
			{ event: "worker_stopped" },
			"Worker stopped",
		);
		expect(exitSpy).toHaveBeenCalledWith(0);
	});
});
