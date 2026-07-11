const fs = require("node:fs");
const path = require("node:path");
const {
	S3Client,
	PutObjectCommand,
	GetObjectCommand,
} = require("@aws-sdk/client-s3");

const isProduction = process.env.NODE_ENV === "production";
const pdfRoot = path.join(process.cwd(), "tmp/pdfs");
const client = isProduction
	? new S3Client({ region: process.env.AWS_REGION })
	: null;

async function storePDF(invoiceId, pdfBuffer) {
	const key = `invoices/${invoiceId}.pdf`;
	if (isProduction) {
		await client.send(
			new PutObjectCommand({
				Bucket: process.env.S3_BUCKET,
				Key: key,
				Body: pdfBuffer,
				ContentType: "application/pdf",
			}),
		);
	} else {
		const file = path.join(pdfRoot, key);
		await fs.promises.mkdir(path.dirname(file), { recursive: true });
		await fs.promises.writeFile(file, pdfBuffer);
	}
	return key;
}

async function openPDF(pdfKey) {
	if (!isProduction) return fs.createReadStream(path.join(pdfRoot, pdfKey));

	const result = await client.send(
		new GetObjectCommand({
			Bucket: process.env.S3_BUCKET,
			Key: pdfKey,
		}),
	);
	if (!result.Body) throw new Error(`Stored PDF ${pdfKey} has no body`);
	return result.Body;
}

module.exports = { storePDF, openPDF };
