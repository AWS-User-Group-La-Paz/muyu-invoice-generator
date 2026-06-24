const { generatePDF } = require("../../src/services/pdf");
const PDFDocument = require("pdfkit");

jest.mock("pdfkit");

describe("generatePDF", () => {
	let mockDoc;
	const invoice = (overrides = {}) => ({
		id: 1,
		created_at: new Date(),
		company_name: "Test Co",
		company_details: "Test Address",
		items: [],
		subtotal: 0,
		tax_rate: 0,
		total: 0,
		...overrides,
	});
	const finishPdf = (content) => {
		mockDoc.on.mockImplementation((event, callback) => {
			if (event === "data" && content) {
				callback(Buffer.from(content));
			}
			if (event === "end") {
				callback();
			}
			return mockDoc;
		});
	};

	beforeEach(() => {
		mockDoc = {
			page: {
				width: 612,
				height: 792,
				margins: { top: 50, bottom: 50, left: 50, right: 50 },
			},
			on: jest.fn(),
			addPage: jest.fn().mockReturnThis(),
			font: jest.fn().mockReturnThis(),
			fontSize: jest.fn().mockReturnThis(),
			fillColor: jest.fn().mockReturnThis(),
			fill: jest.fn().mockReturnThis(),
			lineWidth: jest.fn().mockReturnThis(),
			rect: jest.fn().mockReturnThis(),
			text: jest.fn().mockReturnThis(),
			moveDown: jest.fn().mockReturnThis(),
			moveTo: jest.fn().mockReturnThis(),
			lineTo: jest.fn().mockReturnThis(),
			strokeColor: jest.fn().mockReturnThis(),
			stroke: jest.fn().mockReturnThis(),
			end: jest.fn(),
		};
		PDFDocument.mockImplementation(() => mockDoc);
	});

	test("should call PDFDocument methods and resolve with buffer", async () => {
		finishPdf("pdf content");

		const pdfBuffer = await generatePDF(
			invoice({
				items: [{ description: "Item 1", cost: 100 }],
				subtotal: 100,
				tax_rate: 10,
				total: 110,
			}),
		);

		expect(pdfBuffer).toBeInstanceOf(Buffer);
		expect(PDFDocument).toHaveBeenCalledWith({
			margin: 50,
			size: "LETTER",
		});
		expect(mockDoc.font).toHaveBeenCalledWith("Helvetica-Bold");
		expect(mockDoc.text).toHaveBeenCalledWith("Invoice", expect.any(Object));
		expect(mockDoc.text).toHaveBeenCalledWith("Test Co");
		expect(mockDoc.text).toHaveBeenCalledWith("Line Items", expect.any(Object));
		expect(mockDoc.text).toHaveBeenCalledWith("TOTAL", expect.any(Object));
		expect(mockDoc.end).toHaveBeenCalled();
	});

	test("should render optional customer billing block when supplied", async () => {
		finishPdf();

		await generatePDF(
			invoice({
				customer_name: "Client LLC",
				customer_details: "42 Worksite Ave",
			}),
		);

		expect(mockDoc.text).toHaveBeenCalledWith("Bill To", expect.any(Object));
		expect(mockDoc.text).toHaveBeenCalledWith("Client LLC");
		expect(mockDoc.text).toHaveBeenCalledWith(
			"42 Worksite Ave",
			expect.any(Object),
		);
	});

	test("should place line items after long customer billing details", async () => {
		finishPdf();
		mockDoc.text.mockImplementation((text, ..._args) => {
			if (text === "Client LLC") {
				mockDoc.y = 198;
			}
			if (String(text).includes("PO 123")) {
				mockDoc.y = 288;
			}
			return mockDoc;
		});

		await generatePDF(
			invoice({
				customer_name: "Client LLC",
				customer_details: "42 Worksite Ave\nAccounts Payable\nPO 123",
			}),
		);

		expect(mockDoc.text).toHaveBeenCalledWith("Description", 50, 336, {
			width: 330,
		});
	});

	test("should keep line item header with first row after long customer billing details", async () => {
		finishPdf();
		mockDoc.text.mockImplementation((text) => {
			if (String(text).includes("PO 123")) {
				mockDoc.y = 674;
			}
			return mockDoc;
		});

		await generatePDF(
			invoice({
				customer_name: "Client LLC",
				customer_details: "42 Worksite Ave\nAccounts Payable\nPO 123",
				items: [{ description: "Item 1", cost: 100 }],
			}),
		);

		expect(mockDoc.addPage).toHaveBeenCalled();
		expect(mockDoc.text).toHaveBeenCalledWith("Description", 50, 74, {
			width: 330,
		});
	});

	test("should add pages for long line item lists", async () => {
		finishPdf();

		await generatePDF(
			invoice({
				items: Array.from({ length: 40 }, (_, index) => ({
					description: `Line item ${index + 1}`,
					cost: 25,
				})),
				subtotal: 1000,
				total: 1000,
			}),
		);

		expect(mockDoc.addPage).toHaveBeenCalled();
		expect(mockDoc.rect).toHaveBeenCalledTimes(
			mockDoc.addPage.mock.calls.length + 1,
		);
	});

	test("should paint pages with an explicit white background", async () => {
		finishPdf();

		await generatePDF(invoice());

		expect(mockDoc.rect).toHaveBeenCalledWith(0, 0, 612, 792);
		expect(mockDoc.fill).toHaveBeenCalledWith("#ffffff");
	});

	test("should normalize newlines in company_details", async () => {
		finishPdf();

		await generatePDF(
			invoice({
				company_details: "Line 1\r\nLine 2",
			}),
		);

		expect(mockDoc.text).toHaveBeenCalledWith(
			"Line 1\nLine 2",
			expect.any(Object),
		);
	});

	test("should handle missing company_details", async () => {
		finishPdf();

		await generatePDF(invoice({ company_details: null }));

		expect(mockDoc.text).toHaveBeenCalledWith("Test Co");
		expect(mockDoc.text).not.toHaveBeenCalledWith("");
	});
});
