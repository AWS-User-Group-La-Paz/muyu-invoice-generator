const mockPoolEnd = jest.fn();

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
	createInvoiceJob: jest.fn(),
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
		const error = jest.spyOn(console, "error").mockImplementation(() => {});
		const exit = jest.spyOn(process, "exit").mockImplementation(() => {});

		require("../../src/web");

		expect(error).toHaveBeenCalledWith(
			expect.stringContaining(
				"DATABASE_URL, AWS_REGION, SQS_QUEUE_URL, S3_BUCKET",
			),
		);
		expect(exit).toHaveBeenCalledWith(1);
	});

	test("worker also requires the production email sender", async () => {
		const error = jest.spyOn(console, "error").mockImplementation(() => {});
		jest.spyOn(console, "log").mockImplementation(() => {});
		const exit = jest.spyOn(process, "exit").mockImplementation(() => {});
		mockPoolEnd.mockResolvedValue();

		const { start } = require("../../src/worker");
		await start();

		expect(error).toHaveBeenCalledWith(expect.stringContaining("EMAIL_FROM"));
		expect(exit).toHaveBeenCalledWith(1);
	});

	test("test mode does not require deployment resources", () => {
		process.env = { NODE_ENV: "test" };
		const exit = jest.spyOn(process, "exit").mockImplementation(() => {});

		require("../../src/web");

		expect(exit).not.toHaveBeenCalled();
	});
});
