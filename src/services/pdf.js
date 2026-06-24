const PDFDocument = require("pdfkit");

const colors = {
	paper: "#ffffff",
	ink: "#1f1b2d",
	muted: "#696276",
	rule: "#d8d2e6",
	accent: "#7054b8",
};

const layout = {
	left: 50,
	right: 562,
	top: 50,
	bottom: 742,
	rowHeight: 24,
};

const formatMoney = (value) => {
	const amount = Number.parseFloat(value);
	return `$${(Number.isFinite(amount) ? amount : 0).toFixed(2)}`;
};

const cleanText = (value) =>
	value ? String(value).replace(/\r/g, "").trim() : "";

const useText = (doc, font = "Helvetica", size = 10, color = colors.ink) =>
	doc.font(font).fontSize(size).fillColor(color);

const setPosition = (doc, x, y) => {
	doc.x = x;
	doc.y = y;
};

const paintPage = (doc) => {
	doc.rect(0, 0, doc.page.width, doc.page.height).fill(colors.paper);
};

const addPage = (doc) => {
	doc.addPage();
	paintPage(doc);
};

const drawRule = (doc, y, color = colors.rule) => {
	doc
		.strokeColor(color)
		.lineWidth(1)
		.moveTo(layout.left, y)
		.lineTo(layout.right, y)
		.stroke();
};

const drawLabel = (doc, label, x, y, width = 180) => {
	setPosition(doc, x, y);
	useText(doc, "Helvetica-Bold", 8, colors.muted).text(label, {
		width,
	});
};

const drawLineHeader = (doc, y) => {
	drawLabel(doc, "Line Items", layout.left, y, 240);
	drawRule(doc, y + 16);
	useText(doc, "Helvetica-Bold", 9, colors.muted);
	doc.text("Description", layout.left, y + 24, { width: 330 });
	doc.text("Amount", 430, y + 24, { width: 132, align: "right" });
	drawRule(doc, y + 42);
	return y + 52;
};

const ensureRowSpace = (doc, y) => {
	if (y + layout.rowHeight <= layout.bottom) {
		return y;
	}
	addPage(doc);
	return drawLineHeader(doc, layout.top);
};

function generatePDF(invoice) {
	return new Promise((resolve, reject) => {
		const doc = new PDFDocument({ margin: 50, size: "LETTER" });
		const buffers = [];
		doc.on("data", buffers.push.bind(buffers));
		doc.on("end", () => {
			const pdfData = Buffer.concat(buffers);
			resolve(pdfData);
		});
		doc.on("error", reject);

		paintPage(doc);

		useText(doc, "Helvetica-Bold", 24).text("Invoice", {
			align: "right",
		});
		useText(doc, "Helvetica", 9, colors.muted);
		doc.text(`Invoice #${invoice.id}`, { align: "right" });
		doc.text(`Date ${new Date(invoice.created_at).toLocaleDateString()}`, {
			align: "right",
		});

		drawLabel(doc, "From", layout.left, layout.top + 2);
		setPosition(doc, layout.left, layout.top + 22);
		useText(doc, "Helvetica-Bold", 14).text(invoice.company_name);
		const companyDetails = cleanText(invoice.company_details);
		if (companyDetails) {
			useText(doc, "Helvetica", 9, colors.muted).text(companyDetails, {
				width: 230,
				lineGap: 2,
			});
		}

		const customerName = cleanText(invoice.customer_name);
		const customerDetails = cleanText(invoice.customer_details);
		let currentY = 166;

		if (customerName || customerDetails) {
			drawLabel(doc, "Bill To", layout.left, currentY);
			setPosition(doc, layout.left, currentY + 20);
			if (customerName) {
				useText(doc, "Helvetica-Bold", 12).text(customerName);
			}
			if (customerDetails) {
				useText(doc, "Helvetica", 9, colors.muted).text(customerDetails, {
					width: 230,
					lineGap: 2,
				});
			}
			currentY = Math.max(currentY + 76, doc.y + 24);
			if (currentY + 52 + layout.rowHeight > layout.bottom) {
				addPage(doc);
				currentY = layout.top;
			}
		}

		currentY = drawLineHeader(doc, currentY);

		invoice.items.forEach((item) => {
			currentY = ensureRowSpace(doc, currentY);
			useText(doc, "Helvetica", 10);
			doc.text(item.description, layout.left, currentY, {
				width: 330,
				lineBreak: false,
				ellipsis: true,
			});
			doc.text(formatMoney(item.cost), 430, currentY, {
				width: 132,
				align: "right",
			});
			currentY += layout.rowHeight;
		});

		currentY += 16;
		if (currentY + 96 > layout.bottom) {
			addPage(doc);
			currentY = layout.top;
		}

		const totalsX = 330;
		drawRule(doc, currentY);
		currentY += 18;

		useText(doc, "Helvetica", 10, colors.muted);
		doc.text("Subtotal", totalsX, currentY, { width: 100, align: "right" });
		doc.text(formatMoney(invoice.subtotal), 462, currentY, {
			width: 100,
			align: "right",
		});

		currentY += 20;
		doc.text(`Tax (${invoice.tax_rate || 0}%)`, totalsX, currentY, {
			width: 100,
			align: "right",
		});
		doc.text(
			formatMoney((invoice.total || 0) - (invoice.subtotal || 0)),
			462,
			currentY,
			{
				width: 100,
				align: "right",
			},
		);

		currentY += 28;
		drawRule(doc, currentY, colors.accent);
		currentY += 12;
		setPosition(doc, totalsX, currentY);
		useText(doc, "Helvetica-Bold", 10).text("TOTAL", {
			width: 100,
			align: "right",
		});
		doc.text(formatMoney(invoice.total), 462, currentY, {
			width: 100,
			align: "right",
		});

		const footerY = Math.min(layout.bottom - 28, currentY + 72);
		drawRule(doc, footerY);
		setPosition(doc, layout.left, footerY + 12);
		useText(doc, "Helvetica", 8, colors.muted).text(
			"Thank you for your business. Please contact the sender with any payment questions.",
			{
				width: 360,
			},
		);

		useText(doc, "Helvetica", 8, colors.muted).text(
			`Invoice #${invoice.id}`,
			430,
			footerY + 12,
			{
				width: 132,
				align: "right",
			},
		);

		doc.end();
	});
}

module.exports = {
	generatePDF,
};
