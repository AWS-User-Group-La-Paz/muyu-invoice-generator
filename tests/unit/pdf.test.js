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
			on: jest.fn(),
			fontSize: jest.fn().mockReturnThis(),
			text: jest.fn().mockReturnThis(),
			moveDown: jest.fn().mockReturnThis(),
			moveTo: jest.fn().mockReturnThis(),
			lineTo: jest.fn().mockReturnThis(),
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
		expect(mockDoc.fontSize).toHaveBeenCalledWith(25);
		expect(mockDoc.text).toHaveBeenCalledWith("INVOICE", expect.any(Object));
		expect(mockDoc.text).toHaveBeenCalledWith("Test Co");
		expect(mockDoc.end).toHaveBeenCalled();
	});

	test("should normalize newlines in company_details", async () => {
		finishPdf();

		await generatePDF(
			invoice({
				company_details: "Line 1\r\nLine 2",
			}),
		);

		expect(mockDoc.text).toHaveBeenCalledWith("Line 1\nLine 2");
	});

	test("should handle missing company_details", async () => {
		finishPdf();

		await generatePDF(invoice({ company_details: null }));

		expect(mockDoc.text).toHaveBeenCalledWith("");
	});
});
