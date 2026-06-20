const morgan = require("morgan");

morgan.token(
	"real-ip",
	/* istanbul ignore next */ (req) => {
		return req.ip || req.headers["x-forwarded-for"] || req.socket.remoteAddress;
	},
);

const httpLogger = morgan((tokens, req, res) => {
	return [
		`[${new Date().toISOString()}]`,
		tokens.method(req, res),
		tokens.url(req, res),
		tokens.status(req, res),
		`(${tokens["response-time"](req, res)} ms)`,
		"- IP:",
		tokens["real-ip"](req, res),
		"- UA:",
		tokens["user-agent"](req, res),
	].join(" ");
});

module.exports = { httpLogger };
