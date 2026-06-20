const { pool, initDB } = require("../../src/services/db");
const { app, start } = require("../../src/web");

jest.mock("../../src/services/db", () => ({
	...jest.requireActual("../../src/services/db"),
	initDB: jest.fn().mockResolvedValue(),
}));

describe("Lifecycle", () => {
	afterEach(() => {
		jest.restoreAllMocks();
	});

	test("should handle start logic", async () => {
		const listenSpy = jest
			.spyOn(app, "listen")
			.mockImplementation((_port, cb) => {
				cb();
				return { close: jest.fn() };
			});

		await start();

		expect(initDB).toHaveBeenCalled();
		expect(listenSpy).toHaveBeenCalled();
	});

	test("should handle start failure", async () => {
		const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
		const exitSpy = jest.spyOn(process, "exit").mockImplementation(() => {});
		jest.spyOn(app, "listen").mockImplementation(() => {
			throw new Error("Listen failure");
		});

		await start();

		expect(errorSpy).toHaveBeenCalled();
		expect(exitSpy).toHaveBeenCalledWith(1);
	});

	test("should handle shutdown", async () => {
		const exitSpy = jest.spyOn(process, "exit").mockImplementation(() => {});
		const poolEndSpy = jest.spyOn(pool, "end").mockResolvedValue();
		jest.spyOn(console, "log").mockImplementation(() => {});

		const { shutdown } = require("../../src/web");
		await shutdown();

		expect(poolEndSpy).toHaveBeenCalled();
		expect(exitSpy).toHaveBeenCalledWith(0);
	});
});
