const client = require("prom-client");

const createWebMetrics = () => {
	const registry = new client.Registry();
	return {
		registry,
		httpRequests: new client.Counter({
			name: "muyu_http_requests_total",
			help: "Completed HTTP requests",
			labelNames: ["method", "route", "status"],
			registers: [registry],
		}),
		httpRequestDuration: new client.Histogram({
			name: "muyu_http_request_duration_seconds",
			help: "HTTP request duration in seconds",
			labelNames: ["method", "route", "status"],
			registers: [registry],
		}),
		invoiceGenerationRequests: new client.Counter({
			name: "muyu_invoice_generation_requests_total",
			help: "Invoice generation requests by outcome",
			labelNames: ["outcome"],
			registers: [registry],
		}),
		invoiceDownloads: new client.Counter({
			name: "muyu_invoice_downloads_total",
			help: "Invoice downloads by outcome",
			labelNames: ["outcome"],
			registers: [registry],
		}),
	};
};

module.exports = { createWebMetrics };
