// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// OpenZeppelin uniswap-hooks: npm install @openzeppelin/uniswap-hooks
import {BaseOverrideFee} from "@openzeppelin/uniswap-hooks/fee/BaseOverrideFee.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {BeforeSwapDelta} from "@uniswap/v4-core/src/types/BeforeSwapDelta.sol";
import {SwapParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";

/// @title PayAgentHook
/// @notice A Uniswap v4 hook using OpenZeppelin's BaseOverrideFee for AI-driven dynamic swap fees.
/// An off-chain AI oracle sets per-pool fee overrides (e.g., 0.01% for stable pairs, higher for volatile)
/// and route recommendations (on-chain vs cross-chain). The hook also tracks swap analytics per pool.
contract PayAgentHook is BaseOverrideFee {
    using PoolIdLibrary for PoolKey;

    // --- Custom Errors (gas-efficient) ---
    error Unauthorized(address caller);
    error InvalidRecommendation(uint8 value);
    error ZeroAddressOracle();
    error FeeTooHigh(uint24 fee);

    // --- Events ---
    event SwapRouted(PoolId indexed poolId, bool onChain, uint256 amountIn);
    event RouteRecommendationUpdated(PoolId indexed poolId, uint8 recommendation);
    event OracleTransferred(address indexed previousOracle, address indexed newOracle);
    event SwapProcessed(PoolId indexed poolId, uint256 amountIn, uint256 newSwapCount);
    event VolumeUpdated(PoolId indexed poolId, uint256 amountIn, uint256 newTotalVolume);
    event PoolFeeUpdated(PoolId indexed poolId, uint24 fee);

    // Maximum fee: 100% in hundredths of a bip = 1_000_000
    uint24 public constant MAX_FEE = 1_000_000;

    // Default fee for pools without an explicit override: 30 bps (0.30%)
    uint24 public constant DEFAULT_FEE = 3000;

    // Routing oracle: off-chain AI sets this
    address public oracle;

    // Swap analytics per pool
    mapping(PoolId => uint256) public swapCount;
    mapping(PoolId => uint256) public totalVolume;

    // Route recommendation from oracle
    // 0 = proceed on-chain, 1 = recommend cross-chain
    mapping(PoolId => uint8) public routeRecommendation;

    // AI-driven per-pool fee override (in hundredths of a bip)
    // 0 means no override set — DEFAULT_FEE will be used
    mapping(PoolId => uint24) public poolFeeOverride;

    constructor(IPoolManager _poolManager, address _oracle) BaseOverrideFee(_poolManager) {
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
            afterInitialize: true,  // Required by BaseOverrideFee to verify dynamic fee
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

    // --- Oracle-controlled functions ---

    /// @notice Oracle sets the per-pool fee override
    /// @param poolId The pool to set the fee for
    /// @param fee Fee in hundredths of a bip (e.g., 100 = 0.01%, 3000 = 0.30%, 10000 = 1.00%)
    function setPoolFee(PoolId poolId, uint24 fee) external onlyOracle {
        if (fee > MAX_FEE) revert FeeTooHigh(fee);
        poolFeeOverride[poolId] = fee;
        emit PoolFeeUpdated(poolId, fee);
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

    // --- View helpers ---

    /// @notice Get the effective fee for a pool (resolves default if no override is set)
    /// @param poolId The pool to query
    /// @return The fee in hundredths of a bip
    function getEffectiveFee(PoolId poolId) external view returns (uint24) {
        uint24 fee = poolFeeOverride[poolId];
        return fee == 0 ? DEFAULT_FEE : fee;
    }

    // --- BaseOverrideFee: dynamic fee calculation ---

    /// @inheritdoc BaseOverrideFee
    /// @dev Returns the AI-oracle-set fee for the pool, or DEFAULT_FEE if none is set.
    function _getFee(
        address,
        PoolKey calldata key,
        SwapParams calldata,
        bytes calldata
    ) internal view override returns (uint24) {
        PoolId poolId = key.toId();
        uint24 fee = poolFeeOverride[poolId];
        return fee == 0 ? DEFAULT_FEE : fee;
    }

    // --- Hook callbacks ---

    /// @dev Called before each swap (after BaseOverrideFee applies the fee override).
    /// We track swap count and emit routing analytics here.
    function _beforeSwap(
        address sender,
        PoolKey calldata key,
        SwapParams calldata params,
        bytes calldata hookData
    ) internal override returns (bytes4, BeforeSwapDelta, uint24) {
        // Let BaseOverrideFee handle the fee override first
        (bytes4 selector, BeforeSwapDelta delta, uint24 feeOverride) =
            super._beforeSwap(sender, key, params, hookData);

        PoolId poolId = key.toId();

        bool onChain = routeRecommendation[poolId] == 0;
        uint256 amountIn = params.amountSpecified > 0
            ? uint256(params.amountSpecified)
            : uint256(-params.amountSpecified);
        emit SwapRouted(poolId, onChain, amountIn);

        swapCount[poolId]++;
        emit SwapProcessed(poolId, amountIn, swapCount[poolId]);

        return (selector, delta, feeOverride);
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
        return (this.afterSwap.selector, 0);
    }
}
