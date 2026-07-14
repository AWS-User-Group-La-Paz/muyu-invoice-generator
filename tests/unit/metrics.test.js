const request = require("supertest");
const {
	createWorkerMetrics,
	sendMetrics,
	startMetricsServer,
	stopMetricsServer,
} = require("../../src/services/metrics");

test("returns 500 when metrics collection fails", async () => {
	const response = {
		setHeader: jest.fn(),
		writeHead: jest.fn().mockReturnThis(),
		end: jest.fn(),
	};
	const registry = {
		contentType: "text/plain",
		metrics: jest.fn().mockRejectedValue(new Error("collection failed")),
	};

	await sendMetrics(registry, response);

	expect(response.writeHead).toHaveBeenCalledWith(500);
	expect(response.end).toHaveBeenCalled();
});

test("serves worker metrics in Prometheus format", async () => {
	const { registry, jobsReceived } = createWorkerMetrics();
	jobsReceived.inc();
	const server = await startMetricsServer(registry, 0);

	try {
		expect(server.address().address).toBe("0.0.0.0");
		const response = await request(server).get("/metrics");

		expect(response.status).toBe(200);
		expect(response.headers["content-type"]).toContain("text/plain");
		expect(response.text).toContain("muyu_invoice_jobs_received_total 1");
	} finally {
		await stopMetricsServer(server);
	}
});
