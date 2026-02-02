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
import {BaseHook} from "@uniswap/v4-periphery/src/utils/BaseHook.sol";

/// @notice Test harness that skips hook address validation during construction.
/// In production, the contract must be deployed at an address with the correct flag bits.
/// For testing, we bypass this check so we can deploy to any address.
contract PayAgentHookHarness is PayAgentHook {
    constructor(IPoolManager _poolManager, address _oracle) PayAgentHook(_poolManager, _oracle) {}

    /// @dev Override to skip address validation in tests
    function validateHookAddress(BaseHook) internal pure override {}
}

contract PayAgentHookTest is Test {
    using PoolIdLibrary for PoolKey;

    PayAgentHookHarness public hook;
    address public oracle = address(0xBEEF);
    address public poolManager = address(0xCAFE);

    // Hook address must have bits 7 (beforeSwap) and 6 (afterSwap) set
    // in the least significant 14 bits, and NO other hook flag bits set.
    // BEFORE_SWAP_FLAG = 1 << 7 = 0x80, AFTER_SWAP_FLAG = 1 << 6 = 0x40
    // Combined = 0xC0. Use a non-zero upper portion to avoid zero-address issues.
    // Use an address with a non-zero upper portion and only beforeSwap + afterSwap flag bits set.
    // The 14 least significant bits control hook flags. 0xC0 = bits 7 and 6 set.
    // Upper bytes ensure it's a realistic address. Only the lowest 14 bits are checked for flags.
    address constant HOOK_ADDRESS = address(uint160(0xa0b86991c6218B36c1d19D4a2e9eb0ce000000c0));

    function setUp() public {
        // Deploy the harness (which skips address validation) to a temporary address
        // then etch the bytecode to the correct hook address
        PayAgentHookHarness impl = new PayAgentHookHarness(IPoolManager(poolManager), oracle);

        // Copy the runtime bytecode to the hook address with correct flag bits
        bytes memory code = address(impl).code;
        vm.etch(HOOK_ADDRESS, code);

        hook = PayAgentHookHarness(HOOK_ADDRESS);

        // Set the storage slots for immutable-like state
        // poolManager is stored as an immutable in the contract bytecode (already embedded from impl)
        // oracle is a regular storage variable, so we need to store it
        // The oracle is stored at slot 0 (first storage variable after immutables)
        vm.store(HOOK_ADDRESS, bytes32(uint256(0)), bytes32(uint256(uint160(oracle))));
    }

    // ──────────────────────────────────────────────
    // Hook Permissions
    // ──────────────────────────────────────────────

    function test_HookPermissions() public view {
        Hooks.Permissions memory permissions = hook.getHookPermissions();

        // beforeSwap and afterSwap should be true
        assertTrue(permissions.beforeSwap, "beforeSwap should be true");
        assertTrue(permissions.afterSwap, "afterSwap should be true");

        // All other permissions should be false
        assertFalse(permissions.beforeInitialize, "beforeInitialize should be false");
        assertFalse(permissions.afterInitialize, "afterInitialize should be false");
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
        vm.expectRevert(PayAgentHook.ZeroAddressOracle.selector);
        new PayAgentHookHarness(IPoolManager(poolManager), address(0));
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

    // ──────────────────────────────────────────────
    // Hook Address Flags
    // ──────────────────────────────────────────────

    function test_HookAddressFlagsMatch() public pure {
        // Verify the hook address has the correct flag bits set
        uint160 addr = uint160(HOOK_ADDRESS);

        // Bit 7 = beforeSwap, Bit 6 = afterSwap
        assertTrue(addr & Hooks.BEFORE_SWAP_FLAG != 0, "Address should have BEFORE_SWAP_FLAG set");
        assertTrue(addr & Hooks.AFTER_SWAP_FLAG != 0, "Address should have AFTER_SWAP_FLAG set");

        // Other flags should not be set
        assertFalse(addr & Hooks.BEFORE_INITIALIZE_FLAG != 0, "BEFORE_INITIALIZE_FLAG should not be set");
        assertFalse(addr & Hooks.AFTER_INITIALIZE_FLAG != 0, "AFTER_INITIALIZE_FLAG should not be set");
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
