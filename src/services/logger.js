const morgan = require("morgan");

const quoted = (value) => JSON.stringify(String(value));
const logLine = (service, level, event, details = "") =>
	`[${new Date().toISOString()}] level=${level} service=${service} event=${event}${details ? ` ${details}` : ""}`;

const httpLogger = morgan((tokens, req, res) => {
	return logLine(
		"web",
		"info",
		"http_request",
		[
			`method=${tokens.method(req, res)}`,
			`path=${quoted(tokens.url(req, res))}`,
			`status=${tokens.status(req, res)}`,
			`durationMs=${tokens["response-time"](req, res)}`,
			`ip=${quoted(tokens["remote-addr"](req, res) || "")}`,
			`ua=${quoted(tokens["user-agent"](req, res) || "")}`,
		].join(" "),
	);
});

module.exports = { httpLogger, logLine, quoted };
