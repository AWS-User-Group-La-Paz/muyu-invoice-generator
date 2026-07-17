const mockPoolEnd = jest.fn();
const mockLogInfo = jest.fn();
const mockLogError = jest.fn();

jest.mock("../../src/services/db", () => ({
	initDB: jest.fn(),
	pool: { end: mockPoolEnd },
	saveInvoice: jest.fn(),
	getInvoicesByOwner: jest.fn(),
	getInvoiceById: jest.fn(),
	markInvoiceComplete: jest.fn(),
	markInvoiceFailed: jest.fn(),
	upsertProfile: jest.fn(),
	getProfileByEmail: jest.fn(),
}));
jest.mock("../../src/services/queue", () => ({
	validateInvoiceJob: jest.fn(),
	enqueueInvoice: jest.fn(),
	checkQueue: jest.fn(),
	receiveInvoice: jest.fn(),
	deleteInvoice: jest.fn(),
}));
jest.mock("../../src/services/storage", () => ({
	storePDF: jest.fn(),
	openPDF: jest.fn(),
}));
jest.mock("../../src/services/email", () => ({ sendInvoiceEmail: jest.fn() }));
jest.mock("../../src/services/logger", () => ({
	createLogger: jest.fn(() => ({ info: mockLogInfo, error: mockLogError })),
}));

describe("environment validation", () => {
	const originalEnv = process.env;

	beforeEach(() => {
		jest.resetModules();
		jest.clearAllMocks();
		process.env = { NODE_ENV: "production" };
	});

	afterAll(() => {
		process.env = originalEnv;
	});

	test("web reports every missing production resource", () => {
		const exit = jest.spyOn(process, "exit").mockImplementation(() => {});

		require("../../src/web");

		expect(mockLogError).toHaveBeenCalledWith(
			{
				event: "missing_environment",
				missing: ["DATABASE_URL", "AWS_REGION", "SQS_QUEUE_URL", "S3_BUCKET"],
			},
			"Required environment variables are missing",
		);
		expect(exit).toHaveBeenCalledWith(1);
	});

	test("worker also requires the production email sender", async () => {
		const exit = jest.spyOn(process, "exit").mockImplementation(() => {});
		mockPoolEnd.mockResolvedValue();

		const { start } = require("../../src/worker");
		await start();

		expect(mockLogError).toHaveBeenCalledWith(
			expect.objectContaining({
				event: "worker_startup_failed",
				err: expect.objectContaining({
					message: expect.stringContaining("EMAIL_FROM"),
				}),
			}),
			"Worker startup failed",
		);
		expect(exit).toHaveBeenCalledWith(1);
	});

	test("test mode does not require deployment resources", () => {
		process.env = { NODE_ENV: "test" };
		const exit = jest.spyOn(process, "exit").mockImplementation(() => {});

		require("../../src/web");

		expect(exit).not.toHaveBeenCalled();
	});
});
