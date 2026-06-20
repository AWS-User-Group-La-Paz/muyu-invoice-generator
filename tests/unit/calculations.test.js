const { calculateInvoice } = require("../../src/services/calculations");

describe("calculateInvoice", () => {
	test.each([
		[
			"totals with tax",
			[
				{ description: "Item 1", cost: "100" },
				{ description: "Item 2", cost: "50" },
			],
			"10",
			{
				subtotal: 150,
				taxAmount: 15,
				total: 165,
				taxRate: 10,
				items: [{ cost: 100 }, { cost: 50 }],
			},
		],
		["empty expenses", [], 10, { subtotal: 0, taxAmount: 0, total: 0 }],
		[
			"invalid cost",
			[{ description: "Invalid", cost: "invalid" }],
			10,
			{ subtotal: 0, total: 0 },
		],
		[
			"rounding",
			[{ description: "Precise", cost: "10.333333" }],
			0,
			{ subtotal: 10.33, items: [{ cost: 10.33 }] },
		],
		[
			"numeric tax rate",
			[{ description: "Item", cost: 100 }],
			5,
			{ taxAmount: 5 },
		],
		["non-array expenses", null, 10, { subtotal: 0, items: [] }],
		[
			"missing cost",
			[{ description: "No cost" }],
			0,
			{ subtotal: 0, items: [{ cost: 0 }] },
		],
	])("%s", (_name, expenses, taxRate, expected) => {
		expect(calculateInvoice(expenses, taxRate)).toMatchObject(expected);
	});
});
