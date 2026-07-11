const mockSend = jest.fn();
const mockClient = jest.fn();

jest.mock("@aws-sdk/client-sqs", () => {
	class Command {
		constructor(input) {
			this.input = input;
		}
	}
	return {
		SQSClient: jest.fn((config) => {
			mockClient(config);
			return { send: mockSend };
		}),
		SendMessageCommand: Command,
		GetQueueAttributesCommand: Command,
		ReceiveMessageCommand: Command,
		DeleteMessageCommand: Command,
	};
});

const loadQueue = (env = {}) => {
	jest.resetModules();
	process.env = { ...process.env, NODE_ENV: "development", ...env };
	return require("../../src/services/queue");
};

describe("queue service", () => {
	const originalEnv = process.env;

	beforeEach(() => {
		mockSend.mockReset();
		mockClient.mockReset();
	});

	afterAll(() => {
		process.env = originalEnv;
	});

	test("builds and validates an ID-only invoice job", () => {
		const { createInvoiceJob, validateInvoiceJob } = loadQueue();
		const job = createInvoiceJob({ id: 12, company_name: "Ignored" });

		expect(job).toEqual({ invoiceId: 12 });
		expect(validateInvoiceJob(job)).toEqual(job);
		expect(() => validateInvoiceJob()).toThrow("positive integer");
		expect(() => validateInvoiceJob({ invoiceId: 0 })).toThrow(
			"positive integer",
		);
		expect(() => validateInvoiceJob({ invoiceId: 1.5 })).toThrow(
			"positive integer",
		);
	});

	test("serializes the job for the fixed local queue", async () => {
		const { enqueueInvoice } = loadQueue();
		mockSend.mockResolvedValue({ MessageId: "message-1" });

		await enqueueInvoice({ invoiceId: 12 });

		expect(mockClient).toHaveBeenCalledWith(
			expect.objectContaining({
				endpoint: "http://localhost:4566",
				region: "us-east-1",
				credentials: { accessKeyId: "test", secretAccessKey: "test" },
			}),
		);
		expect(mockSend.mock.calls[0][0].input).toEqual({
			QueueUrl:
				"http://localhost:4566/queue/us-east-1/000000000000/invoice-pdf-jobs",
			MessageBody: '{"invoiceId":12}',
		});
	});

	test("uses the standard AWS endpoint in production", () => {
		loadQueue({
			NODE_ENV: "production",
			AWS_REGION: "us-west-2",
			SQS_QUEUE_URL: "https://sqs.us-west-2.amazonaws.com/123/invoices",
		});

		expect(mockClient).toHaveBeenCalledWith({ region: "us-west-2" });
	});

	test("long polls for one message with a five-minute visibility timeout", async () => {
		const { receiveInvoice } = loadQueue();
		const message = { Body: '{"invoiceId":12}', ReceiptHandle: "receipt" };
		const abortSignal = new AbortController().signal;
		mockSend.mockResolvedValue({ Messages: [message] });

		await expect(receiveInvoice({ abortSignal })).resolves.toEqual(message);
		expect(mockSend).toHaveBeenCalledWith(
			expect.objectContaining({
				input: expect.objectContaining({
					MaxNumberOfMessages: 1,
					WaitTimeSeconds: 20,
					VisibilityTimeout: 300,
				}),
			}),
			{ abortSignal },
		);
	});

	test("checks the queue, returns an empty poll, and deletes by receipt", async () => {
		const { checkQueue, receiveInvoice, deleteInvoice } = loadQueue();
		mockSend.mockResolvedValue({});

		await expect(checkQueue()).resolves.toBe(
			"http://localhost:4566/queue/us-east-1/000000000000/invoice-pdf-jobs",
		);
		await expect(receiveInvoice()).resolves.toBeNull();
		await deleteInvoice("receipt-1");

		expect(mockSend.mock.calls[0][0].input).toEqual({
			QueueUrl:
				"http://localhost:4566/queue/us-east-1/000000000000/invoice-pdf-jobs",
			AttributeNames: ["QueueArn"],
		});
		expect(mockSend.mock.calls[2][0].input).toEqual({
			QueueUrl:
				"http://localhost:4566/queue/us-east-1/000000000000/invoice-pdf-jobs",
			ReceiptHandle: "receipt-1",
		});
	});
});
