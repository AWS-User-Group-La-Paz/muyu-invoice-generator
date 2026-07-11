const mockSendMail = jest.fn();
const mockCreateTransport = jest.fn(() => ({ sendMail: mockSendMail }));
const mockSesClient = { send: jest.fn() };
const mockSesClientConstructor = jest.fn(() => mockSesClient);

jest.mock("nodemailer", () => ({ createTransport: mockCreateTransport }));
jest.mock("@aws-sdk/client-sesv2", () => ({
	SESv2Client: mockSesClientConstructor,
	SendEmailCommand: class SendEmailCommand {},
}));

const loadEmail = (env = {}) => {
	jest.resetModules();
	process.env = { ...process.env, NODE_ENV: "development", ...env };
	return require("../../src/services/email");
};

describe("invoice email", () => {
	const originalEnv = process.env;

	beforeEach(() => {
		mockSendMail.mockReset();
		mockSendMail.mockResolvedValue({ messageId: "sent" });
		mockCreateTransport.mockClear();
		mockSesClientConstructor.mockClear();
	});

	afterAll(() => {
		process.env = originalEnv;
	});

	test("sends the PDF attachment through local Mailpit", async () => {
		const { sendInvoiceEmail } = loadEmail();
		const pdfBuffer = Buffer.from("pdf");

		await sendInvoiceEmail({
			to: "author@example.com",
			invoiceId: 17,
			pdfBuffer,
		});

		expect(mockCreateTransport).toHaveBeenCalledWith({
			host: "localhost",
			port: 1025,
			secure: false,
		});
		expect(mockSendMail).toHaveBeenCalledWith({
			from: "invoices@muyu.local",
			to: "author@example.com",
			subject: "Invoice 17 generated",
			text: "Your invoice PDF has been generated and is attached.",
			attachments: [{ filename: "invoice-17.pdf", content: pdfBuffer }],
		});
	});

	test("uses the SES v2 transport in production", async () => {
		const { sendInvoiceEmail } = loadEmail({
			NODE_ENV: "production",
			AWS_REGION: "us-west-1",
			EMAIL_FROM: "billing@example.com",
		});

		await sendInvoiceEmail({
			to: "author@example.com",
			invoiceId: 18,
			pdfBuffer: Buffer.from("pdf"),
		});

		expect(mockSesClientConstructor).toHaveBeenCalledWith({
			region: "us-west-1",
		});
		expect(mockCreateTransport).toHaveBeenCalledWith({
			SES: expect.objectContaining({ sesClient: mockSesClient }),
		});
		expect(mockSendMail).toHaveBeenCalledWith(
			expect.objectContaining({ from: "billing@example.com" }),
		);
	});
});
