// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {PayAgentHook} from "../src/PayAgentHook.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";

contract PayAgentHookTest is Test {
    using PoolIdLibrary for PoolKey;

    PayAgentHook public hook;
    address public oracle = address(0xBEEF);
    address public poolManager = address(0xCAFE);

    // Hook address must have the correct flag bits set in the least significant 14 bits:
    //   AFTER_INITIALIZE_FLAG = 1 << 12 = 0x1000 (required by BaseOverrideFee)
    //   BEFORE_SWAP_FLAG      = 1 << 7  = 0x0080
    //   AFTER_SWAP_FLAG       = 1 << 6  = 0x0040
    //   Combined = 0x10C0
    address constant HOOK_ADDRESS = address(uint160(0xA0b86991c6218B36C1D19D4a2E9eB0CE000010C0));

    function setUp() public {
        // Use Foundry's deployCodeTo to deploy the contract at the specific address
        // that has the correct hook flag bits. This bypasses the need for a harness.
        // deployCodeTo places the contract at the target address and runs the constructor there.
        bytes memory constructorArgs = abi.encode(IPoolManager(poolManager), oracle);
        deployCodeTo("PayAgentHook.sol:PayAgentHook", constructorArgs, HOOK_ADDRESS);
        hook = PayAgentHook(HOOK_ADDRESS);
    }

    // ──────────────────────────────────────────────
    // Hook Permissions
    // ──────────────────────────────────────────────

    function test_HookPermissions() public view {
        Hooks.Permissions memory permissions = hook.getHookPermissions();

        // afterInitialize, beforeSwap and afterSwap should be true
        assertTrue(permissions.afterInitialize, "afterInitialize should be true (BaseOverrideFee dynamic fee check)");
        assertTrue(permissions.beforeSwap, "beforeSwap should be true");
        assertTrue(permissions.afterSwap, "afterSwap should be true");

        // All other permissions should be false
        assertFalse(permissions.beforeInitialize, "beforeInitialize should be false");
        assertFalse(permissions.beforeAddLiquidity, "beforeAddLiquidity should be false");
        assertFalse(permissions.afterAddLiquidity, "afterAddLiquidity should be false");
        assertFalse(permissions.beforeRemoveLiquidity, "beforeRemoveLiquidity should be false");
        assertFalse(permissions.afterRemoveLiquidity, "afterRemoveLiquidity should be false");
        assertFalse(permissions.beforeDonate, "beforeDonate should be false");
        assertFalse(permissions.afterDonate, "afterDonate should be false");
        assertFalse(permissions.beforeSwapReturnDelta, "beforeSwapReturnDelta should be false");
        assertFalse(permissions.afterSwapReturnDelta, "afterSwapReturnDelta should be false");
        assertFalse(permissions.afterAddLiquidityReturnDelta, "afterAddLiquidityReturnDelta should be false");
        assertFalse(permissions.afterRemoveLiquidityReturnDelta, "afterRemoveLiquidityReturnDelta should be false");
    }

    // ──────────────────────────────────────────────
    // Constructor & Oracle
    // ──────────────────────────────────────────────

    function test_OracleAddress() public view {
        assertEq(hook.oracle(), oracle, "Oracle address should match constructor arg");
    }

    function test_PoolManagerAddress() public view {
        assertEq(address(hook.poolManager()), poolManager, "Pool manager address should match");
    }

    function test_Constructor_RevertsOnZeroOracle() public {
        // Deploying with zero oracle should revert
        bytes memory constructorArgs = abi.encode(IPoolManager(poolManager), address(0));
        // We need a different address with correct flag bits for this test
        address otherHook = address(uint160(0xDEadBEeFDeADbeEFDEADBeEFDeADBeeF000010c0));
        vm.expectRevert(PayAgentHook.ZeroAddressOracle.selector);
        deployCodeTo("PayAgentHook.sol:PayAgentHook", constructorArgs, otherHook);
    }

    // ──────────────────────────────────────────────
    // Route Recommendation
    // ──────────────────────────────────────────────

    function test_SetRouteRecommendation() public {
        PoolKey memory key = _createTestPoolKey();
        PoolId poolId = key.toId();

        // Oracle can set route recommendation
        vm.prank(oracle);
        hook.setRouteRecommendation(poolId, 1);
        assertEq(hook.routeRecommendation(poolId), 1, "Route recommendation should be 1 (cross-chain)");

        // Oracle can update route recommendation
        vm.prank(oracle);
        hook.setRouteRecommendation(poolId, 0);
        assertEq(hook.routeRecommendation(poolId), 0, "Route recommendation should be 0 (on-chain)");
    }

    function test_SetRouteRecommendation_OnlyOracle() public {
        PoolKey memory key = _createTestPoolKey();
        PoolId poolId = key.toId();

        // Non-oracle should revert with Unauthorized custom error
        address nonOracle = address(0xDEAD);
        vm.prank(nonOracle);
        vm.expectRevert(abi.encodeWithSelector(PayAgentHook.Unauthorized.selector, nonOracle));
        hook.setRouteRecommendation(poolId, 1);
    }

    function test_SetRouteRecommendation_RevertsOnInvalidValue() public {
        PoolKey memory key = _createTestPoolKey();
        PoolId poolId = key.toId();

        vm.prank(oracle);
        vm.expectRevert(abi.encodeWithSelector(PayAgentHook.InvalidRecommendation.selector, uint8(2)));
        hook.setRouteRecommendation(poolId, 2);

        vm.prank(oracle);
        vm.expectRevert(abi.encodeWithSelector(PayAgentHook.InvalidRecommendation.selector, uint8(255)));
        hook.setRouteRecommendation(poolId, 255);
    }

    function test_SetRouteRecommendation_EmitsEvent() public {
        PoolKey memory key = _createTestPoolKey();
        PoolId poolId = key.toId();

        vm.prank(oracle);
        vm.expectEmit(true, false, false, true);
        emit PayAgentHook.RouteRecommendationUpdated(poolId, 1);
        hook.setRouteRecommendation(poolId, 1);
    }

    // ──────────────────────────────────────────────
    // Oracle Transfer
    // ──────────────────────────────────────────────

    function test_TransferOracle() public {
        address newOracle = address(0xFACE);

        vm.prank(oracle);
        hook.transferOracle(newOracle);

        assertEq(hook.oracle(), newOracle, "Oracle should be updated to new address");
    }

    function test_TransferOracle_EmitsEvent() public {
        address newOracle = address(0xFACE);

        vm.prank(oracle);
        vm.expectEmit(true, true, false, false);
        emit PayAgentHook.OracleTransferred(oracle, newOracle);
        hook.transferOracle(newOracle);
    }

    function test_TransferOracle_OnlyOracle() public {
        address nonOracle = address(0xDEAD);

        vm.prank(nonOracle);
        vm.expectRevert(abi.encodeWithSelector(PayAgentHook.Unauthorized.selector, nonOracle));
        hook.transferOracle(address(0xFACE));
    }

    function test_TransferOracle_RevertsOnZeroAddress() public {
        vm.prank(oracle);
        vm.expectRevert(PayAgentHook.ZeroAddressOracle.selector);
        hook.transferOracle(address(0));
    }

    function test_TransferOracle_NewOracleCanAct() public {
        address newOracle = address(0xFACE);
        PoolKey memory key = _createTestPoolKey();
        PoolId poolId = key.toId();

        // Transfer oracle
        vm.prank(oracle);
        hook.transferOracle(newOracle);

        // New oracle can set route recommendation
        vm.prank(newOracle);
        hook.setRouteRecommendation(poolId, 1);
        assertEq(hook.routeRecommendation(poolId), 1);

        // Old oracle can no longer act
        vm.prank(oracle);
        vm.expectRevert(abi.encodeWithSelector(PayAgentHook.Unauthorized.selector, oracle));
        hook.setRouteRecommendation(poolId, 0);
    }

    // ──────────────────────────────────────────────
    // Dynamic Fee: setPoolFee
    // ──────────────────────────────────────────────

    function test_SetPoolFee() public {
        PoolKey memory key = _createTestPoolKey();
        PoolId poolId = key.toId();

        // Oracle sets a stable-pair fee: 100 = 0.01%
        vm.prank(oracle);
        hook.setPoolFee(poolId, 100);
        assertEq(hook.poolFeeOverride(poolId), 100, "Pool fee override should be 100 (0.01%)");
    }

    function test_SetPoolFee_UpdateExisting() public {
        PoolKey memory key = _createTestPoolKey();
        PoolId poolId = key.toId();

        // Set initial fee
        vm.prank(oracle);
        hook.setPoolFee(poolId, 100);
        assertEq(hook.poolFeeOverride(poolId), 100);

        // Update to higher fee for volatile pair
        vm.prank(oracle);
        hook.setPoolFee(poolId, 10000);
        assertEq(hook.poolFeeOverride(poolId), 10000, "Pool fee override should be updated to 10000 (1.00%)");
    }

    function test_SetPoolFee_OnlyOracle() public {
        PoolKey memory key = _createTestPoolKey();
        PoolId poolId = key.toId();

        address nonOracle = address(0xDEAD);
        vm.prank(nonOracle);
        vm.expectRevert(abi.encodeWithSelector(PayAgentHook.Unauthorized.selector, nonOracle));
        hook.setPoolFee(poolId, 100);
    }

    function test_SetPoolFee_RevertsOnFeeTooHigh() public {
        PoolKey memory key = _createTestPoolKey();
        PoolId poolId = key.toId();

        // MAX_FEE is 1_000_000
        vm.prank(oracle);
        vm.expectRevert(abi.encodeWithSelector(PayAgentHook.FeeTooHigh.selector, uint24(1_000_001)));
        hook.setPoolFee(poolId, 1_000_001);
    }

    function test_SetPoolFee_MaxFeeAllowed() public {
        PoolKey memory key = _createTestPoolKey();
        PoolId poolId = key.toId();

        // Exactly MAX_FEE should succeed
        vm.prank(oracle);
        hook.setPoolFee(poolId, 1_000_000);
        assertEq(hook.poolFeeOverride(poolId), 1_000_000, "Max fee should be accepted");
    }

    function test_SetPoolFee_EmitsEvent() public {
        PoolKey memory key = _createTestPoolKey();
        PoolId poolId = key.toId();

        vm.prank(oracle);
        vm.expectEmit(true, false, false, true);
        emit PayAgentHook.PoolFeeUpdated(poolId, 500);
        hook.setPoolFee(poolId, 500);
    }

    function test_SetPoolFee_DifferentPools() public {
        PoolKey memory stableKey = _createTestPoolKey();
        PoolId stablePoolId = stableKey.toId();

        PoolKey memory volatileKey = PoolKey({
            currency0: Currency.wrap(address(0x3)),
            currency1: Currency.wrap(address(0x4)),
            fee: 3000,
            tickSpacing: 60,
            hooks: IHooks(HOOK_ADDRESS)
        });
        PoolId volatilePoolId = volatileKey.toId();

        // Set different fees for different pools
        vm.prank(oracle);
        hook.setPoolFee(stablePoolId, 100); // 0.01% for stables

        vm.prank(oracle);
        hook.setPoolFee(volatilePoolId, 10000); // 1.00% for volatile

        assertEq(hook.poolFeeOverride(stablePoolId), 100, "Stable pool fee should be 100");
        assertEq(hook.poolFeeOverride(volatilePoolId), 10000, "Volatile pool fee should be 10000");
    }

    // ──────────────────────────────────────────────
    // Dynamic Fee: getEffectiveFee
    // ──────────────────────────────────────────────

    function test_GetEffectiveFee_ReturnsDefault() public view {
        PoolKey memory key = _createTestPoolKey();
        PoolId poolId = key.toId();

        // No override set — should return DEFAULT_FEE (3000 = 0.30%)
        uint24 fee = hook.getEffectiveFee(poolId);
        assertEq(fee, 3000, "Effective fee should default to 3000 (0.30%) when no override is set");
    }

    function test_GetEffectiveFee_ReturnsOverride() public {
        PoolKey memory key = _createTestPoolKey();
        PoolId poolId = key.toId();

        vm.prank(oracle);
        hook.setPoolFee(poolId, 100);

        uint24 fee = hook.getEffectiveFee(poolId);
        assertEq(fee, 100, "Effective fee should return the oracle override (100 = 0.01%)");
    }

    // ──────────────────────────────────────────────
    // Dynamic Fee: Constants
    // ──────────────────────────────────────────────

    function test_Constants() public view {
        assertEq(hook.MAX_FEE(), 1_000_000, "MAX_FEE should be 1_000_000");
        assertEq(hook.DEFAULT_FEE(), 3000, "DEFAULT_FEE should be 3000 (0.30%)");
    }

    // ──────────────────────────────────────────────
    // Initial State
    // ──────────────────────────────────────────────

    function test_InitialSwapCountIsZero() public view {
        PoolKey memory key = _createTestPoolKey();
        PoolId poolId = key.toId();

        assertEq(hook.swapCount(poolId), 0, "Initial swap count should be 0");
        assertEq(hook.totalVolume(poolId), 0, "Initial total volume should be 0");
    }

    function test_InitialRouteRecommendationIsZero() public view {
        PoolKey memory key = _createTestPoolKey();
        PoolId poolId = key.toId();

        assertEq(hook.routeRecommendation(poolId), 0, "Initial route recommendation should be 0 (on-chain)");
    }

    function test_InitialPoolFeeOverrideIsZero() public view {
        PoolKey memory key = _createTestPoolKey();
        PoolId poolId = key.toId();

        assertEq(hook.poolFeeOverride(poolId), 0, "Initial pool fee override should be 0 (use default)");
    }

    // ──────────────────────────────────────────────
    // Hook Address Flags
    // ──────────────────────────────────────────────

    function test_HookAddressFlagsMatch() public pure {
        // Verify the hook address has the correct flag bits set
        uint160 addr = uint160(HOOK_ADDRESS);

        // Expected flags: afterInitialize (bit 12), beforeSwap (bit 7), afterSwap (bit 6)
        assertTrue(addr & Hooks.AFTER_INITIALIZE_FLAG != 0, "Address should have AFTER_INITIALIZE_FLAG set");
        assertTrue(addr & Hooks.BEFORE_SWAP_FLAG != 0, "Address should have BEFORE_SWAP_FLAG set");
        assertTrue(addr & Hooks.AFTER_SWAP_FLAG != 0, "Address should have AFTER_SWAP_FLAG set");

        // Other flags should not be set
        assertFalse(addr & Hooks.BEFORE_INITIALIZE_FLAG != 0, "BEFORE_INITIALIZE_FLAG should not be set");
        assertFalse(addr & Hooks.BEFORE_ADD_LIQUIDITY_FLAG != 0, "BEFORE_ADD_LIQUIDITY_FLAG should not be set");
        assertFalse(addr & Hooks.AFTER_ADD_LIQUIDITY_FLAG != 0, "AFTER_ADD_LIQUIDITY_FLAG should not be set");
        assertFalse(addr & Hooks.BEFORE_REMOVE_LIQUIDITY_FLAG != 0, "BEFORE_REMOVE_LIQUIDITY_FLAG should not be set");
        assertFalse(addr & Hooks.AFTER_REMOVE_LIQUIDITY_FLAG != 0, "AFTER_REMOVE_LIQUIDITY_FLAG should not be set");
        assertFalse(addr & Hooks.BEFORE_DONATE_FLAG != 0, "BEFORE_DONATE_FLAG should not be set");
        assertFalse(addr & Hooks.AFTER_DONATE_FLAG != 0, "AFTER_DONATE_FLAG should not be set");
        assertFalse(addr & Hooks.BEFORE_SWAP_RETURNS_DELTA_FLAG != 0, "BEFORE_SWAP_RETURNS_DELTA_FLAG should not be set");
        assertFalse(addr & Hooks.AFTER_SWAP_RETURNS_DELTA_FLAG != 0, "AFTER_SWAP_RETURNS_DELTA_FLAG should not be set");
    }

    // ──────────────────────────────────────────────
    // Dynamic Fee + Oracle Transfer Integration
    // ──────────────────────────────────────────────

    function test_NewOracleCanSetPoolFee() public {
        address newOracle = address(0xFACE);
        PoolKey memory key = _createTestPoolKey();
        PoolId poolId = key.toId();

        // Transfer oracle
        vm.prank(oracle);
        hook.transferOracle(newOracle);

        // New oracle can set pool fee
        vm.prank(newOracle);
        hook.setPoolFee(poolId, 500);
        assertEq(hook.poolFeeOverride(poolId), 500);

        // Old oracle cannot set pool fee
        vm.prank(oracle);
        vm.expectRevert(abi.encodeWithSelector(PayAgentHook.Unauthorized.selector, oracle));
        hook.setPoolFee(poolId, 100);
    }

    // ──────────────────────────────────────────────
    // Helpers
    // ──────────────────────────────────────────────

    // Helper to create a consistent test pool key
    function _createTestPoolKey() internal pure returns (PoolKey memory) {
        return PoolKey({
            currency0: Currency.wrap(address(0x1)),
            currency1: Currency.wrap(address(0x2)),
            fee: 3000,
            tickSpacing: 60,
            hooks: IHooks(HOOK_ADDRESS)
        });
    }
}
