import { ethers } from "ethers";

export type AiInvoiceDraft = {
  payer: string;
  amount: string;
  memo: string;
  dueDate: string;
  note: string;
  source: "ai" | "local";
};

type InvoiceSnapshot = {
  id: string;
  amount: string;
  dueDate: string;
  paidAt: string;
  canceled: boolean;
};

type TreasurySnapshot = {
  balance: string;
  received: string;
  paid: string;
  settled: string;
  invoice?: InvoiceSnapshot | null;
};

function parseJsonObject<T>(text: string): T | null {
  try {
    return JSON.parse(text) as T;
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;

    try {
      return JSON.parse(match[0]) as T;
    } catch {
      return null;
    }
  }
}

async function requestAssistant<T>(
  path: string,
  payload: unknown,
  fallback: () => T,
  parse: (text: string) => T | null
): Promise<T> {
  try {
    const response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!response.ok) return fallback();

    const data = await response.json();
    if (!data.text) return fallback();

    return parse(data.text) ?? fallback();
  } catch {
    return fallback();
  }
}

function nextDate(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

export function localInvoiceDraft(prompt: string): AiInvoiceDraft {
  const address = prompt.match(/0x[a-fA-F0-9]{40}/)?.[0] || "";
  const amountMatch = prompt.match(/(?:\$|USDC\s*)?(\d+(?:\.\d+)?)(?:\s*USDC)?/i);
  const dayMatch = prompt.match(/(\d+)\s*(?:days?|d)/i);
  const memoMatch =
    prompt.match(/(?:for|invoice for|payment for|bill for)\s+([^,.]+)/i)?.[1]?.trim() ||
    prompt.replace(address, "").replace(amountMatch?.[0] || "", "").trim();

  return {
    payer: address,
    amount: amountMatch?.[1] || "25.00",
    memo: memoMatch ? memoMatch.slice(0, 48) : "Arc USDC invoice",
    dueDate: nextDate(dayMatch ? Number(dayMatch[1]) : 7),
    note: "Drafted locally. Configure a provider for richer parsing.",
    source: "local"
  };
}

export async function generateInvoiceDraft(prompt: string) {
  return requestAssistant<AiInvoiceDraft>(
    "/api/ai/parse-invoice",
    { prompt },
    () => localInvoiceDraft(prompt),
    (text) => {
      const parsed = parseJsonObject<Omit<AiInvoiceDraft, "source">>(text);
      if (!parsed) return null;

      return {
        payer: ethers.isAddress(parsed.payer || "") ? parsed.payer : "",
        amount: parsed.amount || "25.00",
        memo: parsed.memo || "Arc USDC invoice",
        dueDate: parsed.dueDate || "",
        note: parsed.note || "Generated from natural language.",
        source: "ai"
      };
    }
  );
}

export function localTreasurySummary(snapshot: TreasurySnapshot) {
  const invoiceStatus = snapshot.invoice
    ? snapshot.invoice.canceled
      ? `Invoice #${snapshot.invoice.id} is canceled.`
      : snapshot.invoice.paidAt === "Unpaid"
        ? `Invoice #${snapshot.invoice.id} is unpaid for ${snapshot.invoice.amount} USDC.`
        : `Invoice #${snapshot.invoice.id} is paid.`
    : "No invoice is currently loaded.";

  return `Wallet balance is ${snapshot.balance} USDC. You have received ${snapshot.received} USDC and paid ${snapshot.paid} USDC through this contract. ${invoiceStatus} Next action: load unpaid invoices and send reminders before creating new receivables.`;
}

export async function generateTreasurySummary(snapshot: TreasurySnapshot) {
  return requestAssistant<string>(
    "/api/ai/summary",
    snapshot,
    () => localTreasurySummary(snapshot),
    (text) => text
  );
}

export function localReminder(invoice: InvoiceSnapshot) {
  return `Hi, this is a reminder that invoice #${invoice.id} for ${invoice.amount} USDC is ready for settlement on Arc. Please review and complete payment when convenient. Thank you.`;
}

export async function generateReminder(invoice: InvoiceSnapshot) {
  return requestAssistant<string>(
    "/api/ai/reminder",
    { invoice },
    () => localReminder(invoice),
    (text) => text
  );
}
