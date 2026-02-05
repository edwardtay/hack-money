// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {BaseHook} from "@uniswap/v4-periphery/src/utils/BaseHook.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {BeforeSwapDelta, BeforeSwapDeltaLibrary} from "@uniswap/v4-core/src/types/BeforeSwapDelta.sol";
import {SwapParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC4626} from "@openzeppelin/contracts/interfaces/IERC4626.sol";

/// @title YieldHook
/// @notice Uniswap v4 hook that deposits swap output into receiver's ERC-4626 vault
contract YieldHook is BaseHook {
    using PoolIdLibrary for PoolKey;

    error InvalidVault();
    error DepositFailed();

    event YieldDeposited(
        address indexed recipient,
        address indexed vault,
        uint256 amount,
        uint256 shares
    );

    constructor(IPoolManager _poolManager) BaseHook(_poolManager) {}

    function getHookPermissions() public pure override returns (Hooks.Permissions memory) {
        return Hooks.Permissions({
            beforeInitialize: false,
            afterInitialize: false,
            beforeAddLiquidity: false,
            afterAddLiquidity: false,
            beforeRemoveLiquidity: false,
            afterRemoveLiquidity: false,
            beforeSwap: false,
            afterSwap: true,
            beforeDonate: false,
            afterDonate: false,
            beforeSwapReturnDelta: false,
            afterSwapReturnDelta: false,
            afterAddLiquidityReturnDelta: false,
            afterRemoveLiquidityReturnDelta: false
        });
    }

    function _afterSwap(
        address,
        PoolKey calldata key,
        SwapParams calldata params,
        BalanceDelta delta,
        bytes calldata hookData
    ) internal override returns (bytes4, int128) {
        // Decode recipient and vault from hookData
        if (hookData.length == 0) {
            return (IHooks.afterSwap.selector, 0);
        }

        (address recipient, address vault) = abi.decode(hookData, (address, address));

        if (vault == address(0)) {
            return (IHooks.afterSwap.selector, 0);
        }

        // Get the output token and amount
        Currency outputCurrency = params.zeroForOne ? key.currency1 : key.currency0;
        int128 outputAmount = params.zeroForOne ? delta.amount1() : delta.amount0();

        // Only process if we received tokens (negative delta means tokens out of pool to user)
        if (outputAmount >= 0) {
            return (IHooks.afterSwap.selector, 0);
        }

        uint256 depositAmount = uint256(uint128(-outputAmount));
        address token = Currency.unwrap(outputCurrency);

        // Deposit to vault
        _depositToVault(token, vault, recipient, depositAmount);

        return (IHooks.afterSwap.selector, 0);
    }

    function _depositToVault(
        address token,
        address vault,
        address recipient,
        uint256 amount
    ) internal {
        // Approve vault to spend tokens
        IERC20(token).approve(vault, amount);

        // Deposit and credit shares to recipient
        uint256 shares = IERC4626(vault).deposit(amount, recipient);

        emit YieldDeposited(recipient, vault, amount, shares);
    }
}
