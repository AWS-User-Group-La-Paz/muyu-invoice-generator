const http = require("node:http");
const { once } = require("node:events");
const {
	createWorkerMetrics,
	startMetricsServer,
	stopMetricsServer,
} = require("../../src/services/metrics");

test("serves worker metrics in Prometheus format", async () => {
	const { registry, jobsReceived } = createWorkerMetrics();
	jobsReceived.inc();
	const server = await startMetricsServer(registry, 0);

	try {
		const response = await new Promise((resolve) => {
			http.get(`http://127.0.0.1:${server.address().port}/metrics`, resolve);
		});
		const chunks = [];
		response.on("data", (chunk) => chunks.push(chunk));
		await once(response, "end");

		expect(response.statusCode).toBe(200);
		expect(response.headers["content-type"]).toContain("text/plain");
		expect(Buffer.concat(chunks).toString()).toContain(
			"muyu_invoice_jobs_received_total 1",
		);
	} finally {
		await stopMetricsServer(server);
	}
});
