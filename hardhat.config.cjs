require("dotenv").config();
require("@nomicfoundation/hardhat-ethers");

const ARC_PRIVATE_KEY = process.env.ARC_PRIVATE_KEY;

module.exports = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      }
    }
  },
  networks: {
    arcTestnet: {
      url: "https://rpc.testnet.arc.network",
      chainId: 5042002,
      accounts: ARC_PRIVATE_KEY ? [ARC_PRIVATE_KEY] : []
    }
  }
};
