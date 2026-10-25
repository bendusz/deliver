// Invoice lines: { description, quantity, unitCents }. Amounts are integer cents.
export const lineSubtotal = (line) => line.quantity * line.unitCents;
