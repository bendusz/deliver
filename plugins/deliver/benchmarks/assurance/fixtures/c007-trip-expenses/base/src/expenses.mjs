// Shared expenses for group trips. Amounts are integer cents.
export function totalCents(expenses) {
  return expenses.reduce((sum, e) => sum + e.amountCents, 0);
}
