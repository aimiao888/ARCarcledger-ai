export type InvoiceView = {
  id: string;
  issuer: string;
  payer: string;
  amount: string;
  dueDate: string;
  paidAt: string;
  canceled: boolean;
};
