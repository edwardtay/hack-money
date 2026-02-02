// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {BaseHook} from "@uniswap/v4-periphery/src/utils/BaseHook.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {BeforeSwapDelta, BeforeSwapDeltaLibrary} from "@uniswap/v4-core/src/types/BeforeSwapDelta.sol";
import {SwapParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";

/// @title PayAgentHook
/// @notice A Uniswap v4 hook that acts as an intent resolver for stablecoin swaps.
/// An off-chain AI oracle can set route recommendations (on-chain vs cross-chain)
/// and the hook tracks swap analytics per pool.
contract PayAgentHook is BaseHook {
    using PoolIdLibrary for PoolKey;

    // --- Custom Errors (gas-efficient) ---
    error Unauthorized(address caller);
    error InvalidRecommendation(uint8 value);
    error ZeroAddressOracle();

    // --- Events ---
    event SwapRouted(PoolId indexed poolId, bool onChain, uint256 amountIn);
    event RouteRecommendationUpdated(PoolId indexed poolId, uint8 recommendation);
    event OracleTransferred(address indexed previousOracle, address indexed newOracle);
    event SwapProcessed(PoolId indexed poolId, uint256 amountIn, uint256 newSwapCount);
    event VolumeUpdated(PoolId indexed poolId, uint256 amountIn, uint256 newTotalVolume);

    // Routing oracle: off-chain AI sets this
    address public oracle;

    // Swap analytics per pool
    mapping(PoolId => uint256) public swapCount;
    mapping(PoolId => uint256) public totalVolume;

    // Route recommendation from oracle
    // 0 = proceed on-chain, 1 = recommend cross-chain
    mapping(PoolId => uint8) public routeRecommendation;

    constructor(IPoolManager _poolManager, address _oracle) BaseHook(_poolManager) {
        if (_oracle == address(0)) revert ZeroAddressOracle();
        oracle = _oracle;
    }

    modifier onlyOracle() {
        if (msg.sender != oracle) revert Unauthorized(msg.sender);
        _;
    }

    function getHookPermissions() public pure override returns (Hooks.Permissions memory) {
        return Hooks.Permissions({
            beforeInitialize: false,
            afterInitialize: false,
            beforeAddLiquidity: false,
            afterAddLiquidity: false,
            beforeRemoveLiquidity: false,
            afterRemoveLiquidity: false,
            beforeSwap: true,
            afterSwap: true,
            beforeDonate: false,
            afterDonate: false,
            beforeSwapReturnDelta: false,
            afterSwapReturnDelta: false,
            afterAddLiquidityReturnDelta: false,
            afterRemoveLiquidityReturnDelta: false
        });
    }

    /// @notice Oracle sets the route recommendation for a pool
    /// @param poolId The pool to set the recommendation for
    /// @param recommendation 0 = on-chain, 1 = cross-chain
    function setRouteRecommendation(PoolId poolId, uint8 recommendation) external onlyOracle {
        if (recommendation > 1) revert InvalidRecommendation(recommendation);
        routeRecommendation[poolId] = recommendation;
        emit RouteRecommendationUpdated(poolId, recommendation);
    }

    /// @notice Transfer oracle role to a new address
    /// @param newOracle The new oracle address
    function transferOracle(address newOracle) external onlyOracle {
        if (newOracle == address(0)) revert ZeroAddressOracle();
        address previousOracle = oracle;
        oracle = newOracle;
        emit OracleTransferred(previousOracle, newOracle);
    }

    function _beforeSwap(
        address,
        PoolKey calldata key,
        SwapParams calldata params,
        bytes calldata
    ) internal override returns (bytes4, BeforeSwapDelta, uint24) {
        PoolId poolId = key.toId();

        bool onChain = routeRecommendation[poolId] == 0;
        uint256 amountIn = params.amountSpecified > 0
            ? uint256(params.amountSpecified)
            : uint256(-params.amountSpecified);
        emit SwapRouted(poolId, onChain, amountIn);

        swapCount[poolId]++;
        emit SwapProcessed(poolId, amountIn, swapCount[poolId]);

        return (BaseHook.beforeSwap.selector, BeforeSwapDeltaLibrary.ZERO_DELTA, 0);
    }

    function _afterSwap(
        address,
        PoolKey calldata key,
        SwapParams calldata params,
        BalanceDelta,
        bytes calldata
    ) internal override returns (bytes4, int128) {
        PoolId poolId = key.toId();
        uint256 amountIn = params.amountSpecified > 0
            ? uint256(params.amountSpecified)
            : uint256(-params.amountSpecified);
        totalVolume[poolId] += amountIn;
        emit VolumeUpdated(poolId, amountIn, totalVolume[poolId]);
        return (BaseHook.afterSwap.selector, 0);
    }
}
