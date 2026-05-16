import { useMemo, useState } from "react";
import { ethers } from "ethers";
import {
  Banknote,
  Bot,
  Check,
  Copy,
  FilePlus2,
  Landmark,
  ReceiptText,
  RefreshCw,
  Send,
  ShieldCheck,
  Wallet
} from "lucide-react";
import { generateInvoiceDraft, generateReminder, generateTreasurySummary } from "./ai";
import { formatUsdc, shortAddress, ZERO_ADDRESS } from "./format";
import type { InvoiceView } from "./types";
import {
  ARC_CHAIN_ID,
  ARC_CHAIN_ID_HEX,
  ARC_EXPLORER,
  ARC_RPC_URL,
  ARC_USDC_ADDRESS,
  INVOICE_CONTRACT_ADDRESS,
  invoiceAbi,
  usdcAbi
} from "./contracts";

declare global {
  interface Window {
    ethereum?: ethers.Eip1193Provider;
  }
}

export function App() {
  const [account, setAccount] = useState("");
  const [status, setStatus] = useState("Connect a wallet to create and settle Arc USDC invoices.");
  const [payer, setPayer] = useState("");
  const [amount, setAmount] = useState("25.00");
  const [memo, setMemo] = useState("INV-ARC-001");
  const [dueDate, setDueDate] = useState("");
  const [lookupId, setLookupId] = useState("");
  const [invoice, setInvoice] = useState<InvoiceView | null>(null);
  const [balance, setBalance] = useState("0.00");
  const [received, setReceived] = useState("0.00");
  const [paid, setPaid] = useState("0.00");
  const [settled, setSettled] = useState("0.00");
  const [aiPrompt, setAiPrompt] = useState("Invoice 125 USDC for product design work due in 7 days");
  const [aiOutput, setAiOutput] = useState("Assistant output will appear here.");
  const [busy, setBusy] = useState(false);
  const [walletMenuOpen, setWalletMenuOpen] = useState(false);

  const hasContract = Boolean(INVOICE_CONTRACT_ADDRESS);

  const contractLink = useMemo(() => {
    if (!hasContract) return "";
    return `${ARC_EXPLORER}/address/${INVOICE_CONTRACT_ADDRESS}`;
  }, [hasContract]);

  async function getSigner() {
    if (!window.ethereum) throw new Error("No injected wallet found.");
    const provider = new ethers.BrowserProvider(window.ethereum);
    const network = await provider.getNetwork();

    if (Number(network.chainId) !== ARC_CHAIN_ID) {
      await window.ethereum.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: ARC_CHAIN_ID_HEX,
            chainName: "Arc Testnet",
            nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
            rpcUrls: [ARC_RPC_URL],
            blockExplorerUrls: [ARC_EXPLORER]
          }
        ]
      });
    }

    return provider.getSigner();
  }

  async function connectWallet() {
    try {
      setBusy(true);
      const signer = await getSigner();
      const address = await signer.getAddress();
      setAccount(address);
      setWalletMenuOpen(false);
      setStatus(`Connected ${shortAddress(address)} on Arc Testnet.`);
      await refreshStats(address);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Wallet connection failed.");
    } finally {
      setBusy(false);
    }
  }

  function disconnectWallet() {
    setAccount("");
    setWalletMenuOpen(false);
    setBalance("0.00");
    setReceived("0.00");
    setPaid("0.00");
    setStatus("Wallet disconnected. Connect a wallet to continue.");
  }

  async function refreshStats(address = account) {
    if (!address) return;
    const provider = new ethers.BrowserProvider(window.ethereum!);
    const usdc = new ethers.Contract(ARC_USDC_ADDRESS, usdcAbi, provider);
    const usdcBalance = await usdc.balanceOf(address);
    setBalance(formatUsdc(usdcBalance));

    if (hasContract) {
      const treasury = new ethers.Contract(INVOICE_CONTRACT_ADDRESS, invoiceAbi, provider);
      setReceived(formatUsdc(await treasury.totalReceived(address)));
      setPaid(formatUsdc(await treasury.totalPaid(address)));
      setSettled(formatUsdc(await treasury.totalSettled()));
    }
  }

  async function createInvoice() {
    if (!hasContract) {
      setStatus("Deploy the contract and set VITE_CONTRACT_ADDRESS before creating invoices.");
      return;
    }

    try {
      setBusy(true);
      const signer = await getSigner();
      const treasury = new ethers.Contract(INVOICE_CONTRACT_ADDRESS, invoiceAbi, signer);
      const parsedAmount = ethers.parseUnits(amount || "0", 6);
      const dueTimestamp = dueDate ? Math.floor(new Date(`${dueDate}T23:59:59`).getTime() / 1000) : 0;
      const payerAddress = payer.trim() || ZERO_ADDRESS;
      const invoiceCode = ethers.hexlify(ethers.randomBytes(32));
      const tx = await treasury.createInvoice(
        invoiceCode,
        payerAddress,
        parsedAmount,
        dueTimestamp,
        ethers.id(memo || "invoice")
      );
      const receipt = await tx.wait();
      setLookupId(invoiceCode);
      setStatus(`Invoice created. Code ${shortAddress(invoiceCode)}. Tx ${shortAddress(receipt.hash)}.`);
      await refreshStats(await signer.getAddress());
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Create invoice failed.");
    } finally {
      setBusy(false);
    }
  }

  async function loadInvoice() {
    if (!hasContract) {
      setStatus("Set VITE_CONTRACT_ADDRESS to load invoices from Arc.");
      return;
    }

    try {
      if (!ethers.isHexString(lookupId, 32)) {
        setStatus("Enter a valid invoice code.");
        return;
      }

      setBusy(true);
      const provider = new ethers.BrowserProvider(window.ethereum!);
      const treasury = new ethers.Contract(INVOICE_CONTRACT_ADDRESS, invoiceAbi, provider);
      const raw = await treasury.getInvoice(lookupId);
      if (raw.issuer === ZERO_ADDRESS) {
        setInvoice(null);
        setStatus("Invoice not found.");
        return;
      }

      const viewer = account.toLowerCase();
      const issuer = String(raw.issuer).toLowerCase();
      const payerAddress = String(raw.payer).toLowerCase();
      const isOpenInvoice = payerAddress === ZERO_ADDRESS.toLowerCase();
      const canViewInvoice = isOpenInvoice || viewer === issuer || viewer === payerAddress;

      if (!canViewInvoice) {
        setInvoice(null);
        setStatus("This invoice is restricted to its issuer and payer.");
        return;
      }

      setInvoice({
        id: raw.id,
        issuer: raw.issuer,
        payer: raw.payer,
        amount: formatUsdc(raw.amount),
        dueDate: raw.dueDate === 0n ? "Open" : new Date(Number(raw.dueDate) * 1000).toLocaleDateString(),
        paidAt: raw.paidAt === 0n ? "Unpaid" : new Date(Number(raw.paidAt) * 1000).toLocaleString(),
        canceled: raw.canceled
      });
      setStatus(`Loaded invoice ${shortAddress(lookupId)}.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Load invoice failed.");
    } finally {
      setBusy(false);
    }
  }

  async function payLoadedInvoice() {
    if (!invoice || !hasContract) return;

    try {
      setBusy(true);
      const signer = await getSigner();
      const usdc = new ethers.Contract(ARC_USDC_ADDRESS, usdcAbi, signer);
      const treasury = new ethers.Contract(INVOICE_CONTRACT_ADDRESS, invoiceAbi, signer);
      const amountToPay = ethers.parseUnits(invoice.amount.replace(/,/g, ""), 6);
      const allowance = await usdc.allowance(await signer.getAddress(), INVOICE_CONTRACT_ADDRESS);

      if (allowance < amountToPay) {
        const approveTx = await usdc.approve(INVOICE_CONTRACT_ADDRESS, amountToPay);
        await approveTx.wait();
      }

      const payTx = await treasury.payInvoice(invoice.id);
      await payTx.wait();
      setStatus(`Invoice ${shortAddress(invoice.id)} paid with USDC.`);
      await loadInvoice();
      await refreshStats(await signer.getAddress());
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Payment failed.");
    } finally {
      setBusy(false);
    }
  }

  function copyPaymentLink() {
    const url = `${window.location.origin}?invoice=${encodeURIComponent(lookupId)}`;
    void navigator.clipboard.writeText(url);
    setStatus("Private invoice link copied.");
  }

  async function draftInvoiceWithAi() {
    try {
      setBusy(true);
      const draft = await generateInvoiceDraft(aiPrompt);
      setPayer(draft.payer);
      setAmount(draft.amount);
      setMemo(draft.memo);
      setDueDate(draft.dueDate);
      setAiOutput(`${draft.source === "ai" ? "Provider" : "Local"} draft: ${draft.note}`);
      setStatus("Invoice fields updated from natural language.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "AI invoice draft failed.");
    } finally {
      setBusy(false);
    }
  }

  async function summarizeTreasury() {
    try {
      setBusy(true);
      const summary = await generateTreasurySummary({
        balance,
        received,
        paid,
        settled,
        invoice: invoice
          ? {
              id: invoice.id,
              amount: invoice.amount,
              dueDate: invoice.dueDate,
              paidAt: invoice.paidAt,
              canceled: invoice.canceled
            }
          : null
      });
      setAiOutput(summary);
      setStatus("Treasury summary generated.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "AI summary failed.");
    } finally {
      setBusy(false);
    }
  }

  async function draftReminder() {
    if (!invoice) {
      setStatus("Load an invoice before drafting a reminder.");
      return;
    }

    try {
      setBusy(true);
      const reminder = await generateReminder({
        id: invoice.id,
        amount: invoice.amount,
        dueDate: invoice.dueDate,
        paidAt: invoice.paidAt,
        canceled: invoice.canceled
      });
      setAiOutput(reminder);
      setStatus("Payment reminder generated.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "AI reminder failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="shell">
      <header className="topbar">
        <div className="brandBlock">
          <p className="eyebrow">Arc Testnet</p>
          <h1>ArcLedger AI</h1>
          <p>Private-code USDC invoices and treasury settlement for Arc builders.</p>
        </div>
        <div className="walletControl">
          <button
            className="primary"
            onClick={account ? () => setWalletMenuOpen((open) => !open) : connectWallet}
            disabled={busy}
          >
            <Wallet size={18} />
            {account ? shortAddress(account) : "Connect"}
          </button>
          {account && walletMenuOpen && (
            <div className="walletMenu">
              <button onClick={disconnectWallet}>Disconnect</button>
              <button onClick={connectWallet}>Reconnect</button>
            </div>
          )}
        </div>
      </header>

      <section className="status" aria-live="polite">
        <div>
          <span className="statusLabel">Status</span>
          <strong>{status}</strong>
        </div>
        <button onClick={() => refreshStats()} disabled={!account || busy} title="Refresh balances">
          <RefreshCw size={16} />
        </button>
      </section>

      {!hasContract && (
        <section className="notice">
          Deploy first with <code>npm run deploy:arc</code>, then set <code>VITE_CONTRACT_ADDRESS</code> in <code>.env</code>.
        </section>
      )}

      <section className="metrics">
        <article>
          <div className="metricIcon">
            <Wallet size={18} />
          </div>
          <span>Wallet USDC</span>
          <strong>{balance}</strong>
        </article>
        <article>
          <div className="metricIcon">
            <Landmark size={18} />
          </div>
          <span>Received</span>
          <strong>{received}</strong>
        </article>
        <article>
          <div className="metricIcon">
            <Banknote size={18} />
          </div>
          <span>Paid</span>
          <strong>{paid}</strong>
        </article>
        <article>
          <div className="metricIcon">
            <ShieldCheck size={18} />
          </div>
          <span>Network Settled</span>
          <strong>{settled}</strong>
        </article>
      </section>

      <section className="workspace">
        <form className="panel" onSubmit={(event) => event.preventDefault()}>
          <div className="panelTitle">
            <FilePlus2 size={20} />
            <h2>Create invoice</h2>
          </div>
          <label>
            Natural language
            <textarea
              value={aiPrompt}
              onChange={(event) => setAiPrompt(event.target.value)}
              placeholder="Invoice 125 USDC for product design work due in 7 days"
            />
          </label>
          <button className="secondary wide" onClick={draftInvoiceWithAi} disabled={busy}>
            <Bot size={18} />
            Draft with AI
          </button>
          <label>
            Payer address
            <input value={payer} onChange={(event) => setPayer(event.target.value)} placeholder="Optional: 0x..." />
          </label>
          <label>
            Amount
            <div className="amountInput">
              <input value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" />
              <span>USDC</span>
            </div>
          </label>
          <label>
            Memo
            <input value={memo} onChange={(event) => setMemo(event.target.value)} />
          </label>
          <label>
            Due date
            <input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
          </label>
          <button className="primary wide" onClick={createInvoice} disabled={busy}>
            <Check size={18} />
            Create
          </button>
        </form>

        <section className="panel">
          <div className="panelTitle">
            <ReceiptText size={20} />
            <h2>Collect payment</h2>
          </div>
          <label>
            Invoice code
            <div className="row">
              <input
                className="codeInput"
                value={lookupId}
                onChange={(event) => setLookupId(event.target.value.trim())}
                placeholder="0x..."
              />
              <button onClick={loadInvoice} disabled={busy} title="Load invoice">
                <RefreshCw size={16} />
              </button>
              <button onClick={copyPaymentLink} title="Copy payment link">
                <Copy size={16} />
              </button>
            </div>
          </label>

          <div className="invoiceBox">
            {invoice ? (
              <>
                <div>
                  <span>Status</span>
                  <strong>{invoice.canceled ? "Canceled" : invoice.paidAt === "Unpaid" ? "Unpaid" : "Paid"}</strong>
                </div>
                <div>
                  <span>Amount</span>
                  <strong>{invoice.amount} USDC</strong>
                </div>
                <div>
                  <span>Issuer</span>
                  <strong>{shortAddress(invoice.issuer)}</strong>
                </div>
                <div>
                  <span>Payer</span>
                  <strong>{invoice.payer === ZERO_ADDRESS ? "Open" : shortAddress(invoice.payer)}</strong>
                </div>
                <div>
                  <span>Due</span>
                  <strong>{invoice.dueDate}</strong>
                </div>
                <div>
                  <span>Paid at</span>
                  <strong>{invoice.paidAt}</strong>
                </div>
              </>
            ) : (
              <p>Load an invoice to review and settle it with Arc USDC.</p>
            )}
          </div>

          <button className="secondary wide" onClick={payLoadedInvoice} disabled={!invoice || busy}>
            <Banknote size={18} />
            Approve & Pay
          </button>
          {contractLink && (
            <a className="explorer" href={contractLink} target="_blank" rel="noreferrer">
              <ShieldCheck size={16} />
              View contract on ArcScan
            </a>
          )}
        </section>
      </section>

      <section className="aiPanel">
        <div className="panelTitle">
          <Bot size={20} />
          <h2>Treasury assistant</h2>
        </div>
        <div className="aiActions">
          <button onClick={summarizeTreasury} disabled={busy}>
            <ReceiptText size={16} />
            Summarize
          </button>
          <button onClick={draftReminder} disabled={busy}>
            <Send size={16} />
            Reminder
          </button>
          <button
            onClick={() => {
              void navigator.clipboard.writeText(aiOutput);
              setStatus("AI output copied.");
            }}
            title="Copy AI output"
          >
            <Copy size={16} />
          </button>
        </div>
        <p>{aiOutput}</p>
      </section>
    </main>
  );
}
