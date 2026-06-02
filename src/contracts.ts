export const ARC_CHAIN_ID = 5042002;
export const ARC_CHAIN_ID_HEX = "0x4cef52";
export const ARC_RPC_URL = "https://rpc.testnet.arc.network";
export const ARC_EXPLORER = "https://testnet.arcscan.app";
export const ARC_USDC_ADDRESS =
  import.meta.env.VITE_USDC_ADDRESS || "0x3600000000000000000000000000000000000000";
export const INVOICE_CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS || "";
export const SWAP_ROUTER_ADDRESS = import.meta.env.VITE_SWAP_ROUTER_ADDRESS || "";

export const usdcAbi = [
  "function approve(address spender,uint256 value) returns (bool)",
  "function allowance(address owner,address spender) view returns (uint256)",
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)"
] as const;

export const erc20Abi = [
  "function approve(address spender,uint256 value) returns (bool)",
  "function allowance(address owner,address spender) view returns (uint256)",
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)"
] as const;

export const swapRouterAbi = [
  "function swapExactTokensForTokens(uint256 amountIn,uint256 amountOutMin,address[] path,address to,uint256 deadline) returns (uint256[] amounts)"
] as const;

export const invoiceAbi = [
  "function createInvoice(bytes32 invoiceId,address payer,uint256 amount,uint64 dueDate,bytes32 memoHash)",
  "function cancelInvoice(bytes32 invoiceId)",
  "function payInvoice(bytes32 invoiceId)",
  "function getInvoice(bytes32 invoiceId) view returns ((bytes32 id,address issuer,address payer,uint256 amount,uint64 dueDate,bytes32 memoHash,uint64 createdAt,uint64 paidAt,bool canceled))",
  "function totalSettled() view returns (uint256)",
  "function totalReceived(address account) view returns (uint256)",
  "function totalPaid(address account) view returns (uint256)",
  "event InvoiceCreated(bytes32 indexed invoiceId,address indexed issuer,address indexed payer,uint256 amount,uint64 dueDate,bytes32 memoHash)",
  "event InvoicePaid(bytes32 indexed invoiceId,address indexed payer,address indexed issuer,uint256 amount)"
] as const;
