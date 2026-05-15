# ArcLedger AI

An AI-assisted invoicing and treasury settlement app for Arc testnet. It lets a business, freelancer, or agent draft USDC invoices from natural language, share an invoice ID, approve USDC, settle payment, summarize treasury status, and generate payment reminders.

## Why Arc

Arc is stablecoin-native, so this product treats USDC settlement as the core workflow instead of a side payment rail. Users pay with USDC, the invoice state is recorded on-chain, and treasury totals can be read directly from the contract.

## Core Features

- Create an invoice with amount, optional payer address, memo hash, and due date.
- Draft invoice fields from natural language with an AI assistant.
- Pay open invoices with Arc testnet USDC.
- Restrict invoices to a named payer when needed.
- Track total received, total paid, and total settled volume.
- Generate treasury summaries and payment reminder copy.
- Frontend wallet flow for adding Arc Testnet and interacting with the contract.

## Tech Stack

- Solidity contract: `contracts/ArcInvoiceTreasury.sol`
- Arc testnet RPC: `https://rpc.testnet.arc.network`
- Arc testnet chain ID: `5042002`
- Default Arc USDC address: `0x3600000000000000000000000000000000000000`
- Frontend: React, Vite, ethers v6
- Contract tooling: Hardhat
- AI route: Vite dev middleware proxying `/api/ai/*` to OpenAI Responses API or OpenClaw

## Local Setup

```bash
npm install
npm run test
npm run build
```

PowerShell may block `npm.ps1`; use `npm.cmd` if needed:

```bash
npm.cmd install
npm.cmd run test
npm.cmd run build
```

## Deploy To Arc Testnet

Create `.env` from `.env.example`:

```env
ARC_PRIVATE_KEY=0xYOUR_DEPLOYER_PRIVATE_KEY
VITE_USDC_ADDRESS=0x3600000000000000000000000000000000000000
OPENAI_API_KEY=sk-YOUR_OPENAI_API_KEY
OPENAI_MODEL=gpt-4.1-mini
AI_PROVIDER=openai
```

`OPENAI_API_KEY` is optional. Without it, the app uses local fallback logic for invoice drafting and text generation so the demo still works.

To use OpenClaw instead, run the OpenClaw gateway locally and switch the provider:

```env
AI_PROVIDER=openclaw
OPENCLAW_BASE_URL=http://127.0.0.1:18789
OPENCLAW_API_KEY=
OPENCLAW_MODEL=default
```

The app calls `OPENCLAW_BASE_URL/v1/chat/completions`, so it works with an OpenAI-compatible OpenClaw gateway. If OpenClaw is unavailable, the frontend falls back to local demo logic.

Deploy:

```bash
npm.cmd run deploy:arc
```

Copy the deployed contract address into `.env`:

```env
VITE_CONTRACT_ADDRESS=0xYOUR_DEPLOYED_INVOICE_CONTRACT
```

Run the app:

```bash
npm.cmd run dev
```

## Grant Application Milestones

This repo can be positioned as a small Arc builder project with concrete milestones:

1. AI testnet MVP: natural-language invoice drafting, Arc contract deployment, USDC payments, treasury stats, and reminder generation.
2. Product polish: add invoice links, CSV export, customer records, recurring invoice templates, and saved AI drafts.
3. Circle integration: connect Circle Wallets, Gateway, CCTP, or App Kit where appropriate.
4. Agent workflow: add policy-based small payments where a user-approved agent can prepare invoices or reminders without custody.
5. Pilot usage: onboard test users, publish demo video, document transaction volume and feedback.
6. Mainnet readiness: security review, production deployment plan, monitoring, and business use case.

## Next Improvements

- Add invoice indexing with events for a full invoice list.
- Add role-based organization treasury accounts.
- Store richer invoice metadata on IPFS or a backend while keeping hashes on-chain.
- Add CSV/PDF invoice exports for real business workflows.
- Add tool-calling AI flows that prepare on-chain actions but require wallet confirmation before signing.
