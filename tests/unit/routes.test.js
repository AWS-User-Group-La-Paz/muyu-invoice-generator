const { Readable } = require("node:stream");
const request = require("supertest");

jest.mock("../../src/services/db");
jest.mock("../../src/services/queue");
jest.mock("../../src/services/storage");
jest.mock("../../src/services/pdf");

const {
	saveInvoice,
	markInvoiceFailed,
	getInvoicesByOwner,
	getInvoiceById,
	getProfileByEmail,
	upsertProfile,
} = require("../../src/services/db");
const {
	createInvoiceJob,
	enqueueInvoice,
} = require("../../src/services/queue");
const { openPDF } = require("../../src/services/storage");
const { generatePDF } = require("../../src/services/pdf");
const { app } = require("../../src/web");

const validInvoice = {
	companyName: "Test Co",
	companyDetails: "Address",
	taxRate: "10",
	"expenses[0][description]": "Item 1",
	"expenses[0][cost]": "100",
};

describe("web routes", () => {
	beforeEach(() => {
		jest.clearAllMocks();
		getProfileByEmail.mockResolvedValue(null);
		getInvoicesByOwner.mockResolvedValue([]);
		createInvoiceJob.mockImplementation((invoice, skipEmail) => ({
			invoiceId: invoice.id,
			skipEmail,
		}));
		enqueueInvoice.mockResolvedValue();
		markInvoiceFailed.mockResolvedValue({ id: 1, status: "failed" });
	});

	afterEach(() => jest.restoreAllMocks());

	test("serves health, the accessible async form, and settings", async () => {
		const health = await request(app).get("/health");
		const home = await request(app).get("/");
		const settings = await request(app)
			.get("/settings")
			.set("Cookie", ["user_email=user@example.com"]);

		expect(health.status).toBe(200);
		expect(home.text).toContain('@submit.prevent="submitInvoice($event)"');
		expect(home.text).toContain("new URLSearchParams(new FormData");
		expect(home.text).toContain('aria-labelledby="generation-modal-title"');
		expect(home.text).toContain(
			'aria-describedby="generation-modal-description"',
		);
		expect(home.text).toContain('role="alert"');
		expect(settings.status).toBe(200);
	});

	test("logs the client IP forwarded by the load balancer", async () => {
		const log = jest.spyOn(process.stdout, "write").mockImplementation();

		await request(app).get("/health").set("X-Forwarded-For", "203.0.113.10");

		expect(log).toHaveBeenCalledWith(
			expect.stringContaining(
				'event=http_request method=GET path="/health" status=200',
			),
		);
		expect(log).toHaveBeenCalledWith(
			expect.stringContaining('ip="203.0.113.10"'),
		);
	});

	test("requires an email before generating", async () => {
		const response = await request(app)
			.post("/generate")
			.type("form")
			.send(validInvoice);

		expect(response.status).toBe(401);
		expect(response.type).toBe("application/json");
		expect(saveInvoice).not.toHaveBeenCalled();
	});

	test.each([
		["company", { ...validInvoice, companyName: " " }],
		["structured company", { ...validInvoice, companyName: { nested: "x" } }],
		["items", { companyName: "Test", taxRate: "10" }],
		["description", { ...validInvoice, "expenses[0][description]": " " }],
		[
			"structured description",
			{
				companyName: "Test Co",
				companyDetails: "Address",
				taxRate: "10",
				"expenses[0][description][nested]": "x",
				"expenses[0][cost]": "100",
			},
		],
		["empty cost", { ...validInvoice, "expenses[0][cost]": "" }],
		["numeric prefix", { ...validInvoice, "expenses[0][cost]": "12abc" }],
		["negative cost", { ...validInvoice, "expenses[0][cost]": "-1" }],
		["tax", { ...validInvoice, taxRate: "101" }],
	])("rejects invalid %s before saving", async (_name, body) => {
		const response = await request(app)
			.post("/generate")
			.set("Cookie", ["user_email=user@example.com"])
			.type("form")
			.send(body);

		expect(response.status).toBe(400);
		expect(response.type).toBe("application/json");
		expect(saveInvoice).not.toHaveBeenCalled();
	});

	test("saves Processing, enqueues a PDF-only job, and returns 202", async () => {
		const invoice = { id: 1, status: "processing" };
		saveInvoice.mockResolvedValue(invoice);
		enqueueInvoice.mockResolvedValue({ MessageId: "message-1" });
		const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});

		const response = await request(app)
			.post("/generate")
			.set("Cookie", ["user_email=user@example.com"])
			.type("form")
			.send({ ...validInvoice, skipEmail: "true" });

		expect(response.status).toBe(202);
		expect(response.body).toEqual({ id: 1, status: "processing" });
		expect(saveInvoice).toHaveBeenCalledWith(
			expect.objectContaining({ owner_email: "user@example.com" }),
		);
		expect(createInvoiceJob).toHaveBeenCalledWith(invoice, true);
		expect(enqueueInvoice).toHaveBeenCalledWith({
			invoiceId: 1,
			skipEmail: true,
		});
		expect(generatePDF).not.toHaveBeenCalled();
		expect(logSpy).toHaveBeenCalledWith(
			expect.stringMatching(
				/service=web event=invoice_queued invoiceId=1 messageId=message-1$/,
			),
		);
	});

	test("marks the saved invoice Failed when enqueueing fails", async () => {
		saveInvoice.mockResolvedValue({ id: 1, status: "processing" });
		enqueueInvoice.mockRejectedValue(new Error("queue down"));
		const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

		const response = await request(app)
			.post("/generate")
			.set("Cookie", ["user_email=user@example.com"])
			.type("form")
			.send(validInvoice);

		expect(response.status).toBe(500);
		expect(markInvoiceFailed).toHaveBeenCalledWith(1);
		expect(errorSpy).toHaveBeenCalledWith(
			expect.stringMatching(
				/service=web event=invoice_enqueue_failed invoiceId=1 error="queue down"$/,
			),
		);
	});

	test("shows all statuses and a Download action only for Complete", async () => {
		getInvoicesByOwner.mockResolvedValue(
			["processing", "complete", "failed"].map((status, index) => ({
				id: index + 1,
				company_name: `Company ${index + 1}`,
				owner_email: "user@example.com",
				created_at: new Date("2026-07-08"),
				total: 100,
				status,
			})),
		);

		const response = await request(app)
			.get("/past-invoices")
			.set("Cookie", ["user_email=user@example.com"]);

		expect(response.status).toBe(200);
		expect(response.text).toContain("Processing");
		expect(response.text).toContain("Complete");
		expect(response.text).toContain("Failed");
		expect(response.text.match(/>Download</g)).toHaveLength(1);
	});

	test.each([
		"processing",
		"failed",
	])("returns 409 for a %s invoice download", async (status) => {
		getInvoiceById.mockResolvedValue({
			id: 1,
			owner_email: "user@example.com",
			status,
		});

		const response = await request(app)
			.get("/download/1")
			.set("Cookie", ["user_email=user@example.com"]);

		expect(response.status).toBe(409);
		expect(openPDF).not.toHaveBeenCalled();
	});

	test("streams a stored Complete PDF without regenerating it", async () => {
		getInvoiceById.mockResolvedValue({
			id: 1,
			owner_email: "user@example.com",
			status: "complete",
			pdf_key: "invoices/1.pdf",
		});
		openPDF.mockResolvedValue(Readable.from(Buffer.from("stored pdf")));

		const response = await request(app)
			.get("/download/1")
			.set("Cookie", ["user_email=user@example.com"]);

		expect(response.status).toBe(200);
		expect(response.header["content-type"]).toBe("application/pdf");
		expect(response.header["content-disposition"]).toContain("invoice-1.pdf");
		expect(response.body).toEqual(Buffer.from("stored pdf"));
		expect(openPDF).toHaveBeenCalledWith("invoices/1.pdf");
		expect(generatePDF).not.toHaveBeenCalled();
	});

	test("keeps profile settings behavior", async () => {
		upsertProfile.mockResolvedValue({ email: "user@example.com" });

		const response = await request(app)
			.post("/settings")
			.set("Cookie", ["user_email=user@example.com"])
			.type("form")
			.send({ companyName: "Defaults", taxRate: "12" });

		expect(response.status).toBe(302);
		expect(upsertProfile).toHaveBeenCalledWith(
			expect.objectContaining({ default_tax_rate: 12 }),
		);
	});
});
