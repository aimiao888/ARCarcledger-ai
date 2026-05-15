const { strict: assert } = require("node:assert");
const { ethers } = require("hardhat");

describe("ArcInvoiceTreasury", function () {
  it("creates and pays an open invoice in USDC", async function () {
    const [issuer, payer] = await ethers.getSigners();
    const USDC = await ethers.getContractFactory("MockUSDC");
    const usdc = await USDC.deploy();
    const Treasury = await ethers.getContractFactory("ArcInvoiceTreasury");
    const treasury = await Treasury.deploy(await usdc.getAddress());

    const amount = ethers.parseUnits("25", 6);
    await usdc.mint(payer.address, amount);

    const memoHash = ethers.id("INV-001");
    const tx = await treasury.connect(issuer).createInvoice(ethers.ZeroAddress, amount, 0, memoHash);
    await tx.wait();

    await usdc.connect(payer).approve(await treasury.getAddress(), amount);
    await treasury.connect(payer).payInvoice(1);

    assert.equal(await usdc.balanceOf(issuer.address), amount);
    assert.equal(await treasury.totalSettled(), amount);
    assert.equal(await treasury.totalReceived(issuer.address), amount);
    assert.equal(await treasury.totalPaid(payer.address), amount);

    const invoice = await treasury.getInvoice(1);
    assert.equal(invoice.issuer, issuer.address);
    assert.equal(invoice.amount, amount);
    assert.notEqual(invoice.paidAt, 0n);
  });

  it("blocks payment from an address that is not the named payer", async function () {
    const [issuer, payer, other] = await ethers.getSigners();
    const USDC = await ethers.getContractFactory("MockUSDC");
    const usdc = await USDC.deploy();
    const Treasury = await ethers.getContractFactory("ArcInvoiceTreasury");
    const treasury = await Treasury.deploy(await usdc.getAddress());

    const amount = ethers.parseUnits("10", 6);
    await usdc.mint(other.address, amount);
    await treasury.connect(issuer).createInvoice(payer.address, amount, 0, ethers.id("restricted"));
    await usdc.connect(other).approve(await treasury.getAddress(), amount);

    await assert.rejects(
      treasury.connect(other).payInvoice(1),
      /Wrong payer/
    );
  });
});
