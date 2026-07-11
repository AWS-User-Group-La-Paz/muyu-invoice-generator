const {
	SQSClient,
	SendMessageCommand,
	GetQueueAttributesCommand,
	ReceiveMessageCommand,
	DeleteMessageCommand,
} = require("@aws-sdk/client-sqs");

const isProduction = process.env.NODE_ENV === "production";
const queueUrl = isProduction
	? process.env.SQS_QUEUE_URL
	: "http://localhost:4566/queue/us-east-1/000000000000/invoice-pdf-jobs";
const client = new SQSClient(
	isProduction
		? { region: process.env.AWS_REGION }
		: {
				region: "us-east-1",
				endpoint: "http://localhost:4566",
				credentials: { accessKeyId: "test", secretAccessKey: "test" },
			},
);

function validateInvoiceJob(job) {
	if (
		!job ||
		!Number.isInteger(job.invoiceId) ||
		job.invoiceId <= 0 ||
		(job.skipEmail !== undefined && typeof job.skipEmail !== "boolean") ||
		Object.keys(job).some((key) => key !== "invoiceId" && key !== "skipEmail")
	) {
		throw new TypeError(
			"Invoice job requires a positive integer invoiceId and optional boolean skipEmail",
		);
	}
	return job;
}

const createInvoiceJob = (invoice, skipEmail = false) => ({
	invoiceId: invoice.id,
	skipEmail,
});

async function enqueueInvoice(job) {
	validateInvoiceJob(job);
	return client.send(
		new SendMessageCommand({
			QueueUrl: queueUrl,
			MessageBody: JSON.stringify(job),
		}),
	);
}

async function checkQueue() {
	await client.send(
		new GetQueueAttributesCommand({
			QueueUrl: queueUrl,
			AttributeNames: ["QueueArn"],
		}),
	);
	return queueUrl;
}

async function receiveInvoice({ abortSignal } = {}) {
	const response = await client.send(
		new ReceiveMessageCommand({
			QueueUrl: queueUrl,
			MaxNumberOfMessages: 1,
			WaitTimeSeconds: 20,
			VisibilityTimeout: 300,
		}),
		{ abortSignal },
	);
	return response.Messages?.[0] || null;
}

async function deleteInvoice(receiptHandle) {
	return client.send(
		new DeleteMessageCommand({
			QueueUrl: queueUrl,
			ReceiptHandle: receiptHandle,
		}),
	);
}

module.exports = {
	createInvoiceJob,
	validateInvoiceJob,
	enqueueInvoice,
	checkQueue,
	receiveInvoice,
	deleteInvoice,
};
