const mockQuery = jest.fn();
const mockOn = jest.fn();

jest.mock("pg", () => ({
	Pool: jest.fn(() => ({ query: mockQuery, on: mockOn, end: jest.fn() })),
}));

const {
	initDB,
	saveInvoice,
	getInvoicesByOwner,
	getInvoiceById,
	markInvoiceComplete,
	markInvoiceFailed,
	upsertProfile,
	getProfileByEmail,
} = require("../../src/services/db");

describe("database service", () => {
	beforeEach(() => {
		mockQuery.mockReset();
		mockOn.mockReset();
	});

	test("creates the final invoice schema without upgrade statements", async () => {
		mockQuery.mockResolvedValue({ rows: [] });
		const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});

		await initDB();

		const sql = mockQuery.mock.calls.map(([text]) => text).join("\n");
		expect(sql).toContain("owner_email TEXT NOT NULL");
		expect(sql).toContain("tax_rate NUMERIC NOT NULL");
		expect(sql).toContain("subtotal NUMERIC NOT NULL");
		expect(sql).toContain("total NUMERIC NOT NULL");
		expect(sql).toContain("items JSONB NOT NULL");
		expect(sql).toContain("status TEXT NOT NULL DEFAULT 'processing'");
		expect(sql).toContain("pdf_key TEXT");
		expect(sql).toContain(
			"CHECK (status IN ('processing', 'complete', 'failed'))",
		);
		expect(sql).not.toContain("ALTER TABLE");
		expect(logSpy).toHaveBeenCalledWith(
			expect.stringMatching(/service=db event=database_initialized$/),
		);
	});

	test.each([
		["complete", markInvoiceComplete, [42, "invoices/42.pdf"]],
		["failed", markInvoiceFailed, [42]],
	])("marks an invoice %s only while it is processing", async (status, transition, args) => {
		const row = { id: 42, status };
		mockQuery.mockResolvedValue({ rows: [row] });

		await expect(transition(...args)).resolves.toEqual(row);

		const [sql, params] = mockQuery.mock.calls[0];
		expect(sql).toContain(`SET status = '${status}'`);
		expect(sql).toContain("WHERE id = $1 AND status = 'processing'");
		expect(params).toEqual(args);
	});

	test("saves an invoice with parameterized values", async () => {
		const saved = { id: 9, status: "processing" };
		mockQuery.mockResolvedValue({ rows: [saved] });

		await expect(
			saveInvoice({
				companyName: "Company",
				companyDetails: "Address",
				customerName: "Customer",
				customerDetails: "PO 4",
				taxRate: 10,
				subtotal: 100,
				total: 110,
				items: [{ description: "Work", cost: 100 }],
				owner_email: "author@example.com",
			}),
		).resolves.toEqual(saved);

		expect(mockQuery.mock.calls[0][0]).toContain("INSERT INTO invoices");
		expect(mockQuery.mock.calls[0][1]).toEqual([
			"Company",
			"Address",
			"Customer",
			"PO 4",
			10,
			100,
			110,
			JSON.stringify([{ description: "Work", cost: 100 }]),
			"author@example.com",
		]);
	});

	test("reads invoices by owner and ID", async () => {
		const invoices = [{ id: 1 }, { id: 2 }];
		mockQuery
			.mockResolvedValueOnce({ rows: invoices })
			.mockResolvedValueOnce({ rows: [invoices[0]] });

		await expect(getInvoicesByOwner("author@example.com")).resolves.toEqual(
			invoices,
		);
		await expect(getInvoiceById(1)).resolves.toEqual(invoices[0]);
		expect(mockQuery.mock.calls[0][1]).toEqual(["author@example.com"]);
		expect(mockQuery.mock.calls[1][1]).toEqual([1]);
	});

	test("upserts and reads profiles", async () => {
		const profile = {
			email: "author@example.com",
			company_name: "Company",
			company_details: "Address",
			default_tax_rate: 10,
		};
		mockQuery
			.mockResolvedValueOnce({ rows: [profile] })
			.mockResolvedValueOnce({ rows: [profile] })
			.mockResolvedValueOnce({ rows: [] });

		await expect(upsertProfile(profile)).resolves.toEqual(profile);
		await expect(getProfileByEmail(profile.email)).resolves.toEqual(profile);
		await expect(getProfileByEmail("missing@example.com")).resolves.toBeNull();
	});
});
