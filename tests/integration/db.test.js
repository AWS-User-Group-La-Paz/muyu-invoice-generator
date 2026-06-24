const {
	pool,
	initDB,
	saveInvoice,
	getInvoicesByOwner,
	getInvoiceById,
	upsertProfile,
	getProfileByEmail,
} = require("../../src/services/db");

const email = `db-${Date.now()}@test.com`;
let ready = false;

describe("Postgres database", () => {
	beforeAll(async () => {
		await initDB();
		ready = true;
	});

	afterAll(async () => {
		if (ready) {
			await pool.query("DELETE FROM invoices WHERE owner_email = $1", [email]);
			await pool.query("DELETE FROM user_profiles WHERE email = $1", [email]);
		}
		await pool.end();
	});

	test("saves and reads invoices by owner", async () => {
		const saved = await saveInvoice({
			companyName: "DB Test Co",
			companyDetails: "Details",
			customerName: "Client LLC",
			customerDetails: "42 Worksite Ave",
			taxRate: 10,
			subtotal: 100,
			total: 110,
			items: [{ description: "Item", cost: 100 }],
			owner_email: email,
		});

		const byId = await getInvoiceById(saved.id);
		const byOwner = await getInvoicesByOwner(email);

		expect(byId.owner_email).toBe(email);
		expect(byId.customer_name).toBe("Client LLC");
		expect(byId.customer_details).toBe("42 Worksite Ave");
		expect(byOwner.map((invoice) => invoice.id)).toContain(saved.id);
	});

	test("upserts profiles", async () => {
		await upsertProfile({
			email,
			company_name: "Default Co",
			company_details: "Default Address",
			default_tax_rate: 15,
		});
		await upsertProfile({
			email,
			company_name: "Updated Co",
			company_details: "Updated Address",
			default_tax_rate: 20,
		});

		const profile = await getProfileByEmail(email);

		expect(profile.company_name).toBe("Updated Co");
		expect(profile.default_tax_rate.toString()).toBe("20");
	});
});
