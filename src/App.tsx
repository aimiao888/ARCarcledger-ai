import { useEffect, useMemo, useState } from "react";
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
  Repeat2,
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
  SWAP_ROUTER_ADDRESS,
  erc20Abi,
  invoiceAbi,
  swapRouterAbi,
  usdcAbi
} from "./contracts";

declare global {
  interface Window {
    ethereum?: ethers.Eip1193Provider;
  }
}

type HistoryItem = {
  id: string;
  role: "Issued" | "Paid";
  amount: string;
  status: string;
  counterparty: string;
};

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
  const [invoiceHistory, setInvoiceHistory] = useState<HistoryItem[]>([]);
  const [swapTokenIn, setSwapTokenIn] = useState(ARC_USDC_ADDRESS);
  const [swapTokenOut, setSwapTokenOut] = useState("");
  const [swapAmount, setSwapAmount] = useState("1.00");
  const [swapMinOut, setSwapMinOut] = useState("0");
  const [aiPrompt, setAiPrompt] = useState("Invoice 125 USDC for product design work due in 7 days");
  const [aiOutput, setAiOutput] = useState("Assistant output will appear here.");
  const [busy, setBusy] = useState(false);
  const [historyBusy, setHistoryBusy] = useState(false);
  const [walletMenuOpen, setWalletMenuOpen] = useState(false);
  const [autoLoadCode, setAutoLoadCode] = useState("");

  const hasContract = Boolean(INVOICE_CONTRACT_ADDRESS);
  const hasSwapRouter = Boolean(SWAP_ROUTER_ADDRESS);
  const readProvider = useMemo(() => new ethers.JsonRpcProvider(ARC_RPC_URL), []);

  const contractLink = useMemo(() => {
    if (!hasContract) return "";
    return `${ARC_EXPLORER}/address/${INVOICE_CONTRACT_ADDRESS}`;
  }, [hasContract]);

  const readContracts = useMemo(() => {
    return {
      usdc: new ethers.Contract(ARC_USDC_ADDRESS, usdcAbi, readProvider),
      treasury: hasContract ? new ethers.Contract(INVOICE_CONTRACT_ADDRESS, invoiceAbi, readProvider) : null
    };
  }, [hasContract, readProvider]);

  function toInvoiceView(raw: any): InvoiceView {
    return {
      id: raw.id,
      issuer: raw.issuer,
      payer: raw.payer,
      amount: formatUsdc(raw.amount),
      dueDate: raw.dueDate === 0n ? "Open" : new Date(Number(raw.dueDate) * 1000).toLocaleDateString(),
      paidAt: raw.paidAt === 0n ? "Unpaid" : new Date(Number(raw.paidAt) * 1000).toLocaleString(),
      canceled: raw.canceled
    };
  }

  function buildPaymentLink(invoiceCode: string) {
    return `${window.location.origin}${window.location.pathname}?invoice=${encodeURIComponent(invoiceCode)}`;
  }

  async function copyText(value: string) {
    await navigator.clipboard.writeText(value);
  }

  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("invoice") || "";
    if (ethers.isHexString(code, 32)) {
      setLookupId(code);
      setAutoLoadCode(code);
      setStatus("Invoice code detected from payment link.");
    }
  }, []);

  useEffect(() => {
    if (!autoLoadCode || !hasContract) return;
    void loadInvoice();
    setAutoLoadCode("");
  }, [autoLoadCode, hasContract]);

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
      await Promise.all([refreshStats(address), loadHistory(address)]);
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
    setInvoiceHistory([]);
    setStatus("Wallet disconnected. Connect a wallet to continue.");
  }

  async function refreshStats(address = account) {
    if (!address) return;
    const stats = [readContracts.usdc.balanceOf(address)];

    if (readContracts.treasury) {
      stats.push(
        readContracts.treasury.totalReceived(address),
        readContracts.treasury.totalPaid(address),
        readContracts.treasury.totalSettled()
      );
    }

    const [usdcBalance, totalReceived, totalPaid, totalSettled] = await Promise.all(stats);
    setBalance(formatUsdc(usdcBalance));

    if (readContracts.treasury) {
      setReceived(formatUsdc(totalReceived));
      setPaid(formatUsdc(totalPaid));
      setSettled(formatUsdc(totalSettled));
    }
  }

  async function refreshDashboard(address = account) {
    if (!address) return;
    await Promise.all([refreshStats(address), loadHistory(address)]);
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
      const issuer = await signer.getAddress();
      const tx = await treasury.createInvoice(
        invoiceCode,
        payerAddress,
        parsedAmount,
        dueTimestamp,
        ethers.id(memo || "invoice")
      );
      const receipt = await tx.wait();
      setLookupId(invoiceCode);
      setInvoice({
        id: invoiceCode,
        issuer,
        payer: payerAddress,
        amount: formatUsdc(parsedAmount),
        dueDate: dueTimestamp === 0 ? "Open" : new Date(dueTimestamp * 1000).toLocaleDateString(),
        paidAt: "Unpaid",
        canceled: false
      });
      await copyText(buildPaymentLink(invoiceCode));
      setStatus(`Invoice created and payment link copied. Tx ${shortAddress(receipt.hash)}.`);
      void loadHistory(issuer);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Create invoice failed.");
    } finally {
      setBusy(false);
    }
  }

  async function loadInvoiceByCode(invoiceCode: string) {
    if (!hasContract) {
      setStatus("Set VITE_CONTRACT_ADDRESS to load invoices from Arc.");
      return;
    }

    try {
      if (!ethers.isHexString(invoiceCode, 32)) {
        setStatus("Enter a valid invoice code.");
        return;
      }

      setBusy(true);
      const treasury = readContracts.treasury;
      if (!treasury) throw new Error("Invoice contract is not configured.");

      const raw = await treasury.getInvoice(invoiceCode);
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

      setInvoice(toInvoiceView(raw));
      setLookupId(invoiceCode);
      setStatus(`Loaded invoice ${shortAddress(invoiceCode)}.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Load invoice failed.");
    } finally {
      setBusy(false);
    }
  }

  async function loadInvoice() {
    await loadInvoiceByCode(lookupId);
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
      const address = await signer.getAddress();
      const readTreasury = readContracts.treasury;
      await Promise.all([
        readTreasury
          ? readTreasury.getInvoice(invoice.id).then((raw: any) => {
              setInvoice(toInvoiceView(raw));
            })
          : Promise.resolve(),
        refreshDashboard(address)
      ]);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Payment failed.");
    } finally {
      setBusy(false);
    }
  }

  async function executeSwap() {
    if (!hasSwapRouter) {
      setStatus("Configure VITE_SWAP_ROUTER_ADDRESS before swapping.");
      return;
    }

    if (!ethers.isAddress(swapTokenIn) || !ethers.isAddress(swapTokenOut)) {
      setStatus("Enter valid token addresses for the swap.");
      return;
    }

    try {
      setBusy(true);
      const signer = await getSigner();
      const recipient = await signer.getAddress();
      const tokenIn = new ethers.Contract(swapTokenIn, erc20Abi, signer);
      const tokenOut = new ethers.Contract(swapTokenOut, erc20Abi, signer);
      const router = new ethers.Contract(SWAP_ROUTER_ADDRESS, swapRouterAbi, signer);
      const [tokenInDecimals, tokenOutDecimals] = await Promise.all([tokenIn.decimals(), tokenOut.decimals()]);
      const amountIn = ethers.parseUnits(swapAmount || "0", tokenInDecimals);
      const amountOutMin = ethers.parseUnits(swapMinOut || "0", tokenOutDecimals);

      if (amountIn <= 0n) {
        setStatus("Enter a swap amount greater than zero.");
        return;
      }

      const allowance = await tokenIn.allowance(recipient, SWAP_ROUTER_ADDRESS);
      if (allowance < amountIn) {
        const approveTx = await tokenIn.approve(SWAP_ROUTER_ADDRESS, amountIn);
        await approveTx.wait();
      }

      const deadline = Math.floor(Date.now() / 1000) + 900;
      const swapTx = await router.swapExactTokensForTokens(
        amountIn,
        amountOutMin,
        [swapTokenIn, swapTokenOut],
        recipient,
        deadline
      );
      const receipt = await swapTx.wait();
      setStatus(`Swap submitted. Tx ${shortAddress(receipt.hash)}.`);
      await refreshDashboard(recipient);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Swap failed.");
    } finally {
      setBusy(false);
    }
  }

  async function loadHistory(address = account) {
    if (!address || !readContracts.treasury) return;

    try {
      setHistoryBusy(true);
      const treasury = readContracts.treasury;
      const issuedFilter = treasury.filters.InvoiceCreated(null, address);
      const paidFilter = treasury.filters.InvoicePaid(null, address);
      const [issuedEvents, paidEvents] = await Promise.all([
        treasury.queryFilter(issuedFilter, 0, "latest"),
        treasury.queryFilter(paidFilter, 0, "latest")
      ]);

      const seen = new Map<string, "Issued" | "Paid">();
      for (const event of issuedEvents) {
        const id = (event as ethers.EventLog).args.invoiceId;
        seen.set(id, "Issued");
      }
      for (const event of paidEvents) {
        const id = (event as ethers.EventLog).args.invoiceId;
        if (!seen.has(id)) seen.set(id, "Paid");
      }

      const rows = await Promise.all(
        [...seen.entries()].slice(-12).reverse().map(async ([id, role]) => {
          const raw = await treasury.getInvoice(id);
          const paid = raw.paidAt !== 0n;
          const canceled = raw.canceled;
          const counterparty = role === "Issued" ? raw.payer : raw.issuer;
          return {
            id,
            role,
            amount: `${formatUsdc(raw.amount)} USDC`,
            status: canceled ? "Canceled" : paid ? "Paid" : "Unpaid",
            counterparty: counterparty === ZERO_ADDRESS ? "Open" : shortAddress(counterparty)
          };
        })
      );

      setInvoiceHistory(rows);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "History load failed.");
    } finally {
      setHistoryBusy(false);
    }
  }

  function copyPaymentLink() {
    if (!ethers.isHexString(lookupId, 32)) {
      setStatus("Create or load an invoice before copying a payment link.");
      return;
    }

    void copyText(buildPaymentLink(lookupId));
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
        <button onClick={() => refreshDashboard()} disabled={!account || busy} title="Refresh dashboard">
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

      <section className="historyPanel">
        <div className="panelTitle">
          <ReceiptText size={20} />
          <h2>Invoice history</h2>
        </div>
        <button onClick={() => loadHistory()} disabled={!account || historyBusy} title="Refresh invoice history">
          <RefreshCw size={16} />
          Refresh
        </button>
        <div className="historyList">
          {invoiceHistory.length > 0 ? (
            invoiceHistory.map((item) => (
              <button
                className="historyRow"
                key={`${item.role}-${item.id}`}
                onClick={() => loadInvoiceByCode(item.id)}
              >
                <span className="historyCode">{shortAddress(item.id)}</span>
                <span>{item.role}</span>
                <strong>{item.amount}</strong>
                <span className={`historyStatus ${item.status.toLowerCase()}`}>{item.status}</span>
                <span>{item.counterparty}</span>
              </button>
            ))
          ) : (
            <p>{account ? "No invoices found for this wallet yet." : "Connect a wallet to load invoice history."}</p>
          )}
        </div>
      </section>

      <section className="swapPanel">
        <div className="panelTitle">
          <Repeat2 size={20} />
          <h2>Token swap</h2>
        </div>
        <div className="swapGrid">
          <label>
            Token in
            <input value={swapTokenIn} onChange={(event) => setSwapTokenIn(event.target.value.trim())} placeholder="0x..." />
          </label>
          <label>
            Token out
            <input value={swapTokenOut} onChange={(event) => setSwapTokenOut(event.target.value.trim())} placeholder="0x..." />
          </label>
          <label>
            Amount in
            <input value={swapAmount} onChange={(event) => setSwapAmount(event.target.value)} inputMode="decimal" />
          </label>
          <label>
            Minimum out
            <input value={swapMinOut} onChange={(event) => setSwapMinOut(event.target.value)} inputMode="decimal" />
          </label>
        </div>
        <button className="primary wide" onClick={executeSwap} disabled={!hasSwapRouter || busy}>
          <Repeat2 size={18} />
          {hasSwapRouter ? "Approve & Swap" : "Router not configured"}
        </button>
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
