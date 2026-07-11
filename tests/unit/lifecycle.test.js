const mockInitDB = jest.fn();
const mockPoolEnd = jest.fn();

jest.mock("../../src/services/db", () => ({
	initDB: mockInitDB,
	pool: { end: mockPoolEnd },
	saveInvoice: jest.fn(),
	getInvoicesByOwner: jest.fn(),
	getInvoiceById: jest.fn(),
	markInvoiceFailed: jest.fn(),
	upsertProfile: jest.fn(),
	getProfileByEmail: jest.fn(),
}));
jest.mock("../../src/services/queue");
jest.mock("../../src/services/storage");

const { app, start, shutdown } = require("../../src/web");

describe("web lifecycle", () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockInitDB.mockResolvedValue();
		mockPoolEnd.mockResolvedValue();
	});

	afterEach(() => jest.restoreAllMocks());

	test("initializes the database before listening", async () => {
		const listen = jest
			.spyOn(app, "listen")
			.mockImplementation((_port, ready) => {
				ready();
				return { close: jest.fn() };
			});
		jest.spyOn(console, "log").mockImplementation(() => {});

		await start();

		expect(mockInitDB).toHaveBeenCalledTimes(1);
		expect(listen).toHaveBeenCalled();
	});

	test("exits nonzero on startup failure", async () => {
		mockInitDB.mockRejectedValue(new Error("database unavailable"));
		jest.spyOn(console, "error").mockImplementation(() => {});
		const exit = jest.spyOn(process, "exit").mockImplementation(() => {});

		await start();

		expect(exit).toHaveBeenCalledWith(1);
	});

	test("closes the pool only once during repeated shutdown", async () => {
		jest.spyOn(console, "log").mockImplementation(() => {});
		const exit = jest.spyOn(process, "exit").mockImplementation(() => {});

		await Promise.all([shutdown("SIGTERM"), shutdown("SIGTERM")]);

		expect(mockPoolEnd).toHaveBeenCalledTimes(1);
		expect(exit).toHaveBeenCalledTimes(1);
		expect(exit).toHaveBeenCalledWith(0);
	});
});
