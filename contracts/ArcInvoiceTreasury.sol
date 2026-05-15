// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20 {
    function transferFrom(address from, address to, uint256 value) external returns (bool);
}

contract ArcInvoiceTreasury {
    struct Invoice {
        bytes32 id;
        address issuer;
        address payer;
        uint256 amount;
        uint64 dueDate;
        bytes32 memoHash;
        uint64 createdAt;
        uint64 paidAt;
        bool canceled;
    }

    IERC20 public immutable usdc;
    uint256 public totalSettled;

    mapping(bytes32 => Invoice) public invoices;
    mapping(address => uint256) public totalReceived;
    mapping(address => uint256) public totalPaid;

    event InvoiceCreated(
        bytes32 indexed invoiceId,
        address indexed issuer,
        address indexed payer,
        uint256 amount,
        uint64 dueDate,
        bytes32 memoHash
    );
    event InvoicePaid(bytes32 indexed invoiceId, address indexed payer, address indexed issuer, uint256 amount);
    event InvoiceCanceled(bytes32 indexed invoiceId);

    constructor(address usdcAddress) {
        require(usdcAddress != address(0), "USDC address required");
        usdc = IERC20(usdcAddress);
    }

    function createInvoice(
        bytes32 invoiceId,
        address payer,
        uint256 amount,
        uint64 dueDate,
        bytes32 memoHash
    ) external {
        require(invoiceId != bytes32(0), "Invoice ID required");
        require(invoices[invoiceId].issuer == address(0), "Invoice ID exists");
        require(amount > 0, "Amount required");
        require(dueDate == 0 || dueDate > block.timestamp, "Due date must be future");

        invoices[invoiceId] = Invoice({
            id: invoiceId,
            issuer: msg.sender,
            payer: payer,
            amount: amount,
            dueDate: dueDate,
            memoHash: memoHash,
            createdAt: uint64(block.timestamp),
            paidAt: 0,
            canceled: false
        });

        emit InvoiceCreated(invoiceId, msg.sender, payer, amount, dueDate, memoHash);
    }

    function cancelInvoice(bytes32 invoiceId) external {
        Invoice storage invoice = invoices[invoiceId];
        require(invoice.issuer != address(0), "Invoice not found");
        require(msg.sender == invoice.issuer, "Only issuer");
        require(invoice.paidAt == 0, "Already paid");
        require(!invoice.canceled, "Already canceled");

        invoice.canceled = true;
        emit InvoiceCanceled(invoiceId);
    }

    function payInvoice(bytes32 invoiceId) external {
        Invoice storage invoice = invoices[invoiceId];
        require(invoice.issuer != address(0), "Invoice not found");
        require(invoice.paidAt == 0, "Already paid");
        require(!invoice.canceled, "Canceled");
        require(invoice.payer == address(0) || invoice.payer == msg.sender, "Wrong payer");

        bool ok = usdc.transferFrom(msg.sender, invoice.issuer, invoice.amount);
        require(ok, "USDC transfer failed");

        invoice.paidAt = uint64(block.timestamp);
        totalSettled += invoice.amount;
        totalReceived[invoice.issuer] += invoice.amount;
        totalPaid[msg.sender] += invoice.amount;

        emit InvoicePaid(invoiceId, msg.sender, invoice.issuer, invoice.amount);
    }

    function getInvoice(bytes32 invoiceId) external view returns (Invoice memory) {
        return invoices[invoiceId];
    }
}
