import { ethers } from "ethers";

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

export function shortAddress(value: string) {
  return value ? `${value.slice(0, 6)}...${value.slice(-4)}` : "";
}

export function formatUsdc(value: bigint) {
  return Number(ethers.formatUnits(value, 6)).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}
