const { PassThrough } = require("node:stream");
const { once } = require("node:events");
const { createLogger } = require("../../src/services/logger");

test("writes structured errors with stack traces and redacts email", async () => {
	const output = new PassThrough();
	const line = once(output, "data");
	const logger = createLogger("worker", output);
	const error = Object.assign(new Error("database unavailable"), {
		code: "ECONNRESET",
	});

	logger.error(
		{
			event: "invoice_failed",
			invoiceId: 7,
			errorCode: error.code,
			email: "author@example.com",
			err: error,
		},
		"Invoice failed",
	);

	const entry = JSON.parse((await line)[0].toString());
	expect(entry).toMatchObject({
		level: "error",
		service: "worker",
		event: "invoice_failed",
		invoiceId: 7,
		errorCode: "ECONNRESET",
		msg: "Invoice failed",
		err: {
			type: "Error",
			message: "database unavailable",
			stack: expect.stringContaining("Error: database unavailable"),
		},
	});
	expect(entry.email).toBeUndefined();
});
