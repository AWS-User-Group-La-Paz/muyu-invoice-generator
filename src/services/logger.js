const pino = require("pino");

const createLogger = (service, destination) =>
	pino(
		{
			base: { service },
			formatters: {
				level: (label) => ({ level: label }),
			},
			redact: {
				paths: [
					"email",
					"ownerEmail",
					"req.headers.authorization",
					"req.headers.cookie",
				],
				remove: true,
			},
			timestamp: pino.stdTimeFunctions.isoTime,
		},
		destination,
	);

module.exports = { createLogger };
