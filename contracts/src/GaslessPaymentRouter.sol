// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "forge-std/interfaces/IERC20.sol";
import {IERC4626} from "forge-std/interfaces/IERC4626.sol";

/**
 * @title GaslessPaymentRouter
 * @notice Enables gasless payments via Gelato Relay + Permit2
 *
 * Flow:
 * 1. Payer signs Permit2 message (off-chain, free)
 * 2. Gelato relayer calls executePayment with the signature
 * 3. Fee is deducted from the transferred tokens (~0.5-1%)
 * 4. Recipient receives funds in their vault
 *
 * User pays: $0 gas
 * Fee: ~0.5-1% deducted from transfer amount
 */
contract GaslessPaymentRouter {
    // =========================================================================
    // Constants
    // =========================================================================

    /// @notice Permit2 contract (same address on all chains)
    IPermit2 public constant PERMIT2 = IPermit2(0x000000000022D473030F116dDEE9F6B43aC78BA3);

    /// @notice Gelato Relay address for fee context
    address public constant GELATO_RELAY = 0xaBcC9b596420A9E9172FD5938620E265a0f9Df92;

    // =========================================================================
    // Errors
    // =========================================================================

    error OnlyGelatoRelay();
    error InsufficientAmountAfterFee();
    error TransferFailed();
    error VaultDepositFailed();
    error PermitTransferFailed();

    // =========================================================================
    // Events
    // =========================================================================

    event GaslessPayment(
        address indexed payer,
        address indexed recipient,
        address indexed vault,
        address token,
        uint256 amount,
        uint256 fee
    );

    // =========================================================================
    // Modifiers
    // =========================================================================

    modifier onlyGelatoRelay() {
        if (msg.sender != GELATO_RELAY) revert OnlyGelatoRelay();
        _;
    }

    // =========================================================================
    // External Functions
    // =========================================================================

    /**
     * @notice Execute a gasless payment using Permit2 signature
     * @param permit The permit data signed by the payer
     * @param owner The payer's address (signer)
     * @param signature The Permit2 signature
     * @param recipient Final recipient address
     * @param vault Optional vault address for auto-deposit (address(0) for direct transfer)
     * @param maxFee Maximum fee to deduct (for fee protection)
     */
    function executePayment(
        IPermit2.PermitTransferFrom calldata permit,
        address owner,
        bytes calldata signature,
        address recipient,
        address vault,
        uint256 maxFee
    ) external onlyGelatoRelay {
        // Get the Gelato fee from calldata (appended by relay)
        (uint256 fee, address feeToken) = _getFeeDetails();

        // Ensure fee token matches and fee is within bounds
        require(feeToken == permit.permitted.token, "Fee token mismatch");
        require(fee <= maxFee, "Fee exceeds max");

        uint256 amount = permit.permitted.amount;
        uint256 amountAfterFee = amount - fee;
        if (amountAfterFee == 0) revert InsufficientAmountAfterFee();

        // Transfer tokens from payer to this contract via Permit2
        IPermit2.SignatureTransferDetails memory transferDetails = IPermit2.SignatureTransferDetails({
            to: address(this),
            requestedAmount: amount
        });

        PERMIT2.permitTransferFrom(permit, transferDetails, owner, signature);

        // Pay Gelato fee
        IERC20 token = IERC20(permit.permitted.token);
        token.transfer(GELATO_RELAY, fee);

        // Transfer or deposit remaining amount
        if (vault != address(0) && vault != recipient) {
            // Approve and deposit to vault
            token.approve(vault, amountAfterFee);
            uint256 shares = IERC4626(vault).deposit(amountAfterFee, recipient);
            if (shares == 0) revert VaultDepositFailed();
        } else {
            // Direct transfer to recipient
            bool success = token.transfer(recipient, amountAfterFee);
            if (!success) revert TransferFailed();
        }

        emit GaslessPayment(owner, recipient, vault, permit.permitted.token, amountAfterFee, fee);
    }

    /**
     * @notice Simple payment without vault (lower gas)
     */
    function executeSimplePayment(
        IPermit2.PermitTransferFrom calldata permit,
        address owner,
        bytes calldata signature,
        address recipient,
        uint256 maxFee
    ) external onlyGelatoRelay {
        (uint256 fee, address feeToken) = _getFeeDetails();
        require(feeToken == permit.permitted.token, "Fee token mismatch");
        require(fee <= maxFee, "Fee exceeds max");

        uint256 amountAfterFee = permit.permitted.amount - fee;
        if (amountAfterFee == 0) revert InsufficientAmountAfterFee();

        // Transfer to this contract
        IPermit2.SignatureTransferDetails memory transferDetails = IPermit2.SignatureTransferDetails({
            to: address(this),
            requestedAmount: permit.permitted.amount
        });
        PERMIT2.permitTransferFrom(permit, transferDetails, owner, signature);

        // Pay fee and send remainder
        IERC20 token = IERC20(permit.permitted.token);
        token.transfer(GELATO_RELAY, fee);
        token.transfer(recipient, amountAfterFee);

        emit GaslessPayment(owner, recipient, address(0), permit.permitted.token, amountAfterFee, fee);
    }

    // =========================================================================
    // Internal Functions
    // =========================================================================

    /**
     * @notice Extract fee details from Gelato relay calldata
     * Gelato appends: feeCollector (20) + feeToken (20) + fee (32)
     */
    function _getFeeDetails() internal pure returns (uint256 fee, address feeToken) {
        assembly {
            // Fee is last 32 bytes
            fee := calldataload(sub(calldatasize(), 32))
            // Fee token is 20 bytes before fee
            feeToken := shr(96, calldataload(sub(calldatasize(), 52)))
        }
    }
}

// =========================================================================
// Permit2 Interface
// =========================================================================

interface IPermit2 {
    struct TokenPermissions {
        address token;
        uint256 amount;
    }

    struct PermitTransferFrom {
        TokenPermissions permitted;
        uint256 nonce;
        uint256 deadline;
    }

    struct SignatureTransferDetails {
        address to;
        uint256 requestedAmount;
    }

    function permitTransferFrom(
        PermitTransferFrom calldata permit,
        SignatureTransferDetails calldata transferDetails,
        address owner,
        bytes calldata signature
    ) external;
}
