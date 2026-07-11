const nodemailer = require("nodemailer");
const { SESv2Client, SendEmailCommand } = require("@aws-sdk/client-sesv2");

const isProduction = process.env.NODE_ENV === "production";
const transport = isProduction
	? nodemailer.createTransport({
			SES: {
				sesClient: new SESv2Client({ region: process.env.AWS_REGION }),
				SendEmailCommand,
			},
		})
	: nodemailer.createTransport({
			host: "localhost",
			port: 1025,
			secure: false,
		});

async function sendInvoiceEmail({ to, invoiceId, pdfBuffer }) {
	return transport.sendMail({
		from: isProduction ? process.env.EMAIL_FROM : "invoices@muyu.local",
		to,
		subject: `Invoice ${invoiceId} generated`,
		text: "Your invoice PDF has been generated and is attached.",
		attachments: [{ filename: `invoice-${invoiceId}.pdf`, content: pdfBuffer }],
	});
}

module.exports = { sendInvoiceEmail };
