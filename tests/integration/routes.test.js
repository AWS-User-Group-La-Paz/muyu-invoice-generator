const request = require("supertest");
const { app } = require("../../src/web");
const {
	saveInvoice,
	getInvoicesByOwner,
	getInvoiceById,
	getProfileByEmail,
	upsertProfile,
	pool,
} = require("../../src/services/db");
const { generatePDF } = require("../../src/services/pdf");

jest.mock("../../src/services/db");
jest.mock("../../src/services/pdf");

const silenceConsoleError = () =>
	jest.spyOn(console, "error").mockImplementation(() => {});

describe("API Routes", () => {
	afterEach(() => {
		jest.restoreAllMocks();
		jest.clearAllMocks();
	});

	afterAll(async () => {
		await pool.end();
	});

	describe("GET /health", () => {
		test("should return 200 OK", async () => {
			const response = await request(app).get("/health");
			expect(response.status).toBe(200);
			expect(response.body.status).toBe("OK");
		});
	});

	describe("GET /", () => {
		test("should return 200 OK and HTML", async () => {
			const response = await request(app).get("/");
			expect(response.status).toBe(200);
			expect(response.type).toBe("text/html");
		});

		test("should render invoice form controls", async () => {
			const response = await request(app).get("/");
			expect(response.text).toContain("<dialog");
			expect(response.text).toContain("SameSite=Lax");
			expect(response.text).toContain('autocomplete="email"');
			expect(response.text).toContain('inputmode="email"');
			expect(response.text).toContain('aria-labelledby="email-modal-title"');
			expect(response.text).toContain(
				'aria-describedby="email-modal-description"',
			);
			expect(response.text).toContain('@click="addExpense"');
			expect(response.text).toContain('aria-current="page"');
			expect(response.text).toContain('href="/?changeEmail=1"');
			expect(response.text).toContain('name="customerName"');
			expect(response.text).toContain('name="customerDetails"');
			expect(response.text).not.toContain('x-show="generated"');
			expect(response.text).not.toContain("showGenerated");
			expect(response.text).not.toContain("window.scrollTo(0, 0)");
			expect(response.text).not.toContain("resetExpenses");
			expect(response.text).not.toContain("x-init=");
			expect(response.text).not.toContain("window.location.reload");
			expect(response.text).not.toContain('this.companyName = ""');
		});

		test("should include profile defaults if they exist", async () => {
			const email = "prefill@test.com";
			const mockProfile = {
				email,
				company_name: "Prefill Co",
				company_details: "Prefill Details",
				default_tax_rate: 20,
			};
			getProfileByEmail.mockResolvedValue(mockProfile);

			const response = await request(app)
				.get("/")
				.set("Cookie", [`user_email=${email}`]);

			expect(response.text).toContain("Prefill Co");
			expect(response.text).toContain("Prefill Details");
		});

		test("should return 200 even if profile fetch fails", async () => {
			const email = "error@test.com";
			getProfileByEmail.mockRejectedValue(new Error("DB Error"));
			const errorSpy = silenceConsoleError();

			const response = await request(app)
				.get("/")
				.set("Cookie", [`user_email=${email}`]);

			expect(response.status).toBe(200);
			expect(errorSpy).toHaveBeenCalled();
		});
	});

	describe("POST /generate", () => {
		test("should return 200 and PDF buffer on success", async () => {
			const mockInvoice = { id: 1, company_name: "Test", items: [] };
			saveInvoice.mockResolvedValue(mockInvoice);
			generatePDF.mockResolvedValue(Buffer.from("pdf content"));

			const response = await request(app).post("/generate").type("form").send({
				companyName: "Test Co",
				taxRate: "10",
				"expenses[0][description]": "Item 1",
				"expenses[0][cost]": "100",
			});

			expect(response.status).toBe(200);
			expect(response.header["content-type"]).toBe("application/pdf");
			expect(response.header["content-disposition"]).toContain("invoice-1.pdf");
		});

		test("should return 400 if expenses are missing", async () => {
			const response = await request(app)
				.post("/generate")
				.type("form")
				.send({ companyName: "Test Co" });

			expect(response.status).toBe(400);
		});

		test("should return 500 if saveInvoice fails", async () => {
			saveInvoice.mockRejectedValue(new Error("DB Error"));
			const errorSpy = silenceConsoleError();

			const response = await request(app).post("/generate").type("form").send({
				companyName: "Test Co",
				"expenses[0][description]": "Item 1",
				"expenses[0][cost]": "100",
			});

			expect(response.status).toBe(500);
			expect(response.text).toContain('class="shell"');
			expect(response.text).toContain("Invoice failed");
			expect(errorSpy).toHaveBeenCalled();
		});

		test("should save owner_email from user_email cookie", async () => {
			const email = "tester@example.com";
			const mockInvoice = {
				id: 1,
				company_name: "Test",
				items: [],
				owner_email: email,
			};
			saveInvoice.mockResolvedValue(mockInvoice);
			generatePDF.mockResolvedValue(Buffer.from("pdf content"));

			const response = await request(app)
				.post("/generate")
				.set("Cookie", [`user_email=${email}`])
				.type("form")
				.send({
					companyName: "Test Co",
					taxRate: "10",
					"expenses[0][description]": "Item 1",
					"expenses[0][cost]": "100",
				});

			expect(response.status).toBe(200);
			expect(saveInvoice).toHaveBeenCalledWith(
				expect.objectContaining({
					owner_email: email,
				}),
			);
		});

		test("should save customer billing fields", async () => {
			saveInvoice.mockResolvedValue({ id: 1, company_name: "Test", items: [] });
			generatePDF.mockResolvedValue(Buffer.from("pdf content"));

			const response = await request(app).post("/generate").type("form").send({
				companyName: "Test Co",
				customerName: "Client LLC",
				customerDetails: "42 Worksite Ave",
				"expenses[0][description]": "Item 1",
				"expenses[0][cost]": "100",
			});

			expect(response.status).toBe(200);
			expect(saveInvoice).toHaveBeenCalledWith(
				expect.objectContaining({
					customerName: "Client LLC",
					customerDetails: "42 Worksite Ave",
				}),
			);
		});
	});

	describe("GET /past-invoices", () => {
		test("should redirect to / if user_email cookie is missing", async () => {
			const response = await request(app).get("/past-invoices");
			expect(response.status).toBe(302);
			expect(response.header.location).toBe("/");
		});

		test("should return 200 and list invoices for valid user_email", async () => {
			const email = "history@test.com";
			const mockInvoices = [
				{ id: 1, company_name: "History Co", owner_email: email },
			];
			getInvoicesByOwner.mockResolvedValue(mockInvoices);

			const response = await request(app)
				.get("/past-invoices")
				.set("Cookie", [`user_email=${email}`]);

			expect(response.status).toBe(200);
			expect(response.text).toContain('aria-current="page"');
			expect(response.text).toContain('headers="invoice-date"');
			expect(response.text).toContain('class="cell-label" aria-hidden="true"');
			expect(response.text).not.toContain("data-label=");
			expect(getInvoicesByOwner).toHaveBeenCalledWith(email);
		});

		test("should render an actionable empty state", async () => {
			const email = "empty@test.com";
			getInvoicesByOwner.mockResolvedValue([]);

			const response = await request(app)
				.get("/past-invoices")
				.set("Cookie", [`user_email=${email}`]);

			expect(response.status).toBe(200);
			expect(response.text).toContain("No invoices yet");
			expect(response.text).toContain('href="/"');
		});

		test("should return 500 if database fails", async () => {
			getInvoicesByOwner.mockRejectedValue(new Error("DB Error"));
			const errorSpy = silenceConsoleError();

			const response = await request(app)
				.get("/past-invoices")
				.set("Cookie", ["user_email=test@test.com"]);

			expect(response.status).toBe(500);
			expect(response.text).toContain('class="shell"');
			expect(response.text).toContain("Invoice history unavailable");
			expect(errorSpy).toHaveBeenCalled();
		});
	});

	describe("GET /download/:id", () => {
		test("should return 404 if invoice not found", async () => {
			getInvoiceById.mockResolvedValue(null);

			const response = await request(app)
				.get("/download/999")
				.set("Cookie", ["user_email=test@test.com"]);

			expect(response.status).toBe(404);
			expect(response.text).toContain('class="shell"');
			expect(response.text).toContain("Invoice not found");
		});

		test("should return 403 if owner mismatch", async () => {
			getInvoiceById.mockResolvedValue({
				id: 1,
				owner_email: "owner@test.com",
			});

			const response = await request(app)
				.get("/download/1")
				.set("Cookie", ["user_email=hacker@test.com"]);

			expect(response.status).toBe(403);
			expect(response.text).toContain('class="shell"');
			expect(response.text).toContain("Invoice unavailable");
		});

		test("should return 200 and PDF if owner matches", async () => {
			const email = "owner@test.com";
			getInvoiceById.mockResolvedValue({
				id: 1,
				owner_email: email,
				items: [],
			});
			generatePDF.mockResolvedValue(Buffer.from("pdf content"));

			const response = await request(app)
				.get("/download/1")
				.set("Cookie", [`user_email=${email}`]);

			expect(response.status).toBe(200);
			expect(response.header["content-type"]).toBe("application/pdf");
		});

		test("should return 500 if download fails", async () => {
			getInvoiceById.mockRejectedValue(new Error("DB Error"));
			const errorSpy = silenceConsoleError();

			const response = await request(app)
				.get("/download/1")
				.set("Cookie", ["user_email=owner@test.com"]);

			expect(response.status).toBe(500);
			expect(response.text).toContain('class="shell"');
			expect(response.text).toContain("Download failed");
			expect(errorSpy).toHaveBeenCalled();
		});
	});

	describe("Settings Routes", () => {
		test("GET /settings should redirect to / if no user_email cookie", async () => {
			const response = await request(app).get("/settings");
			expect(response.status).toBe(302);
			expect(response.header.location).toBe("/");
		});

		test("GET /settings should return 200 if user_email cookie exists", async () => {
			const email = "settings@test.com";
			getProfileByEmail.mockResolvedValue(null);

			const response = await request(app)
				.get("/settings")
				.set("Cookie", [`user_email=${email}`]);

			expect(response.status).toBe(200);
			expect(response.type).toBe("text/html");
			expect(response.text).toContain('aria-current="page"');
		});

		test("POST /settings should save profile and redirect", async () => {
			const email = "settings@test.com";
			upsertProfile.mockResolvedValue({ email });

			const response = await request(app)
				.post("/settings")
				.set("Cookie", [`user_email=${email}`])
				.type("form")
				.send({
					companyName: "New Co",
					companyDetails: "New Details",
					taxRate: "12",
				});

			expect(response.status).toBe(302);
			expect(response.header.location).toBe("/settings?success=1");
			expect(upsertProfile).toHaveBeenCalledWith(
				expect.objectContaining({
					email,
					company_name: "New Co",
					company_details: "New Details",
					default_tax_rate: 12,
				}),
			);
		});

		test("POST /settings should return 401 if no user_email cookie", async () => {
			const response = await request(app)
				.post("/settings")
				.type("form")
				.send({ companyName: "Hacker Co" });

			expect(response.status).toBe(401);
			expect(response.text).toContain('class="shell"');
			expect(response.text).toContain("Email required");
		});

		test("GET /settings should return 500 if database fails", async () => {
			const email = "error@test.com";
			getProfileByEmail.mockRejectedValue(new Error("DB Error"));
			silenceConsoleError();

			const response = await request(app)
				.get("/settings")
				.set("Cookie", [`user_email=${email}`]);

			expect(response.status).toBe(500);
			expect(response.text).toContain('class="shell"');
			expect(response.text).toContain("Settings unavailable");
		});

		test("POST /settings should return 500 if upsert fails", async () => {
			const email = "error@test.com";
			upsertProfile.mockRejectedValue(new Error("DB Error"));
			silenceConsoleError();

			const response = await request(app)
				.post("/settings")
				.set("Cookie", [`user_email=${email}`])
				.type("form")
				.send({ companyName: "Fail Co" });

			expect(response.status).toBe(500);
			expect(response.text).toContain('class="shell"');
			expect(response.text).toContain("Settings not saved");
		});
	});

	describe("POST /generate errors", () => {
		test("should return 500 if PDF generation fails", async () => {
			saveInvoice.mockResolvedValue({ id: 1, company_name: "Test", items: [] });
			generatePDF.mockRejectedValue(new Error("PDF Error"));
			const errorSpy = silenceConsoleError();

			const response = await request(app).post("/generate").type("form").send({
				companyName: "Test Co",
				"expenses[0][description]": "Item 1",
				"expenses[0][cost]": "100",
			});

			expect(response.status).toBe(500);
			expect(response.text).toContain('class="shell"');
			expect(response.text).toContain("Invoice failed");
			expect(errorSpy).toHaveBeenCalled();
		});
	});
});
