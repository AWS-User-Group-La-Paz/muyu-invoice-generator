function calculateInvoice(expenses, taxRate) {
	const items = Array.isArray(expenses) ? Object.values(expenses) : [];

	const subtotal = items.reduce((sum, item) => {
		const cost = parseFloat(item.cost) || 0;
		return sum + cost;
	}, 0);

	const rate = parseFloat(taxRate) || 0;
	const taxAmount = (subtotal * rate) / 100;
	const total = subtotal + taxAmount;

	return {
		subtotal: parseFloat(subtotal.toFixed(2)),
		taxAmount: parseFloat(taxAmount.toFixed(2)),
		total: parseFloat(total.toFixed(2)),
		taxRate: rate,
		items: items.map((i) => ({
			...i,
			cost: parseFloat(parseFloat(i.cost || 0).toFixed(2)),
		})),
	};
}

module.exports = {
	calculateInvoice,
};
