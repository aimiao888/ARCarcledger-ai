const hre = require("hardhat");

const ARC_USDC = process.env.VITE_USDC_ADDRESS || "0x3600000000000000000000000000000000000000";

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log(`Deploying from ${deployer.address}`);
  console.log(`Using USDC interface ${ARC_USDC}`);

  const Treasury = await hre.ethers.getContractFactory("ArcInvoiceTreasury");
  const treasury = await Treasury.deploy(ARC_USDC);
  await treasury.waitForDeployment();

  const address = await treasury.getAddress();
  console.log(`ArcInvoiceTreasury deployed to ${address}`);
  console.log(`Set VITE_CONTRACT_ADDRESS=${address}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
