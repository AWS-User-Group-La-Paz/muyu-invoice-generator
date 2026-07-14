const client = require("prom-client");
const http = require("node:http");

const sendMetrics = async (registry, res) => {
	try {
		res.setHeader("Content-Type", registry.contentType);
		res.end(await registry.metrics());
	} catch {
		res.writeHead(500).end();
	}
};

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

const createWorkerMetrics = () => {
	const registry = new client.Registry();
	return {
		registry,
		jobsReceived: new client.Counter({
			name: "muyu_invoice_jobs_received_total",
			help: "Invoice jobs received",
			registers: [registry],
		}),
		jobsFinished: new client.Counter({
			name: "muyu_invoice_jobs_finished_total",
			help: "Invoice jobs by terminal outcome",
			labelNames: ["outcome"],
			registers: [registry],
		}),
		jobDuration: new client.Histogram({
			name: "muyu_invoice_job_duration_seconds",
			help: "Invoice job duration in seconds",
			labelNames: ["outcome"],
			registers: [registry],
		}),
		stageDuration: new client.Histogram({
			name: "muyu_invoice_stage_duration_seconds",
			help: "Invoice stage duration in seconds",
			labelNames: ["stage", "outcome"],
			registers: [registry],
		}),
		ackFailures: new client.Counter({
			name: "muyu_invoice_ack_failures_total",
			help: "Invoice queue acknowledgement failures",
			registers: [registry],
		}),
		pollFailures: new client.Counter({
			name: "muyu_worker_poll_failures_total",
			help: "Worker queue polling failures",
			registers: [registry],
		}),
	};
};

const startMetricsServer = (registry, port) =>
	new Promise((resolve, reject) => {
		const server = http.createServer((req, res) => {
			if (req.url !== "/metrics") {
				res.writeHead(404).end();
				return;
			}
			sendMetrics(registry, res);
		});
		server.once("error", reject);
		server.listen(port, "0.0.0.0", () => {
			server.off("error", reject);
			resolve(server);
		});
	});

const stopMetricsServer = (server) =>
	new Promise((resolve, reject) => {
		if (!server?.listening) return resolve();
		server.close((error) => (error ? reject(error) : resolve()));
	});

module.exports = {
	createWebMetrics,
	createWorkerMetrics,
	sendMetrics,
	startMetricsServer,
	stopMetricsServer,
};
