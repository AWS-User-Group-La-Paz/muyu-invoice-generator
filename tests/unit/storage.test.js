const fs = require("node:fs");
const path = require("node:path");
const { Readable } = require("node:stream");

const mockSend = jest.fn();
const mockClient = jest.fn();

jest.mock("@aws-sdk/client-s3", () => {
	class Command {
		constructor(input) {
			this.input = input;
		}
	}
	return {
		S3Client: jest.fn((config) => {
			mockClient(config);
			return { send: mockSend };
		}),
		PutObjectCommand: Command,
		GetObjectCommand: Command,
	};
});

const loadStorage = (env = {}) => {
	jest.resetModules();
	process.env = { ...process.env, NODE_ENV: "development", ...env };
	return require("../../src/services/storage");
};

const read = async (stream) => {
	const chunks = [];
	for await (const chunk of stream) chunks.push(chunk);
	return Buffer.concat(chunks);
};

describe("PDF storage", () => {
	const originalEnv = process.env;
	const invoiceId = 987654321;
	const localFile = path.join(
		process.cwd(),
		"tmp/pdfs/invoices",
		`${invoiceId}.pdf`,
	);

	beforeEach(() => {
		mockSend.mockReset();
		mockClient.mockReset();
	});

	afterAll(async () => {
		process.env = originalEnv;
		await fs.promises.rm(localFile, { force: true });
	});

	test("writes and streams a PDF locally", async () => {
		const { storePDF, openPDF } = loadStorage();
		const pdf = Buffer.from("local pdf");

		await expect(storePDF(invoiceId, pdf)).resolves.toBe(
			`invoices/${invoiceId}.pdf`,
		);
		await expect(
			read(await openPDF(`invoices/${invoiceId}.pdf`)),
		).resolves.toEqual(pdf);
	});

	test("uses the same logical key with S3", async () => {
		const { storePDF, openPDF } = loadStorage({
			NODE_ENV: "production",
			AWS_REGION: "us-east-2",
			S3_BUCKET: "invoice-pdfs",
		});
		const pdf = Buffer.from("cloud pdf");
		mockSend
			.mockResolvedValueOnce({})
			.mockResolvedValueOnce({ Body: Readable.from(pdf) });

		await expect(storePDF(44, pdf)).resolves.toBe("invoices/44.pdf");
		await expect(read(await openPDF("invoices/44.pdf"))).resolves.toEqual(pdf);
		expect(mockClient).toHaveBeenCalledWith({ region: "us-east-2" });
		expect(mockSend.mock.calls[0][0].input).toEqual({
			Bucket: "invoice-pdfs",
			Key: "invoices/44.pdf",
			Body: pdf,
			ContentType: "application/pdf",
		});
		expect(mockSend.mock.calls[1][0].input).toEqual({
			Bucket: "invoice-pdfs",
			Key: "invoices/44.pdf",
		});
	});
});
