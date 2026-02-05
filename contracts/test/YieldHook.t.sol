// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {YieldHook} from "../src/YieldHook.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {SwapParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {BalanceDelta, BalanceDeltaLibrary} from "@uniswap/v4-core/src/types/BalanceDelta.sol";

/// @dev Simple mock ERC20 for testing
contract MockERC20 {
    string public name;
    string public symbol;
    uint8 public decimals;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    constructor(string memory _name, string memory _symbol, uint8 _decimals) {
        name = _name;
        symbol = _symbol;
        decimals = _decimals;
    }

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

/// @dev Simple mock ERC4626 vault for testing
contract MockVault {
    MockERC20 public asset;
    mapping(address => uint256) public balanceOf;

    constructor(MockERC20 _asset) {
        asset = _asset;
    }

    function deposit(uint256 assets, address receiver) external returns (uint256 shares) {
        asset.transferFrom(msg.sender, address(this), assets);
        shares = assets; // 1:1 for simplicity
        balanceOf[receiver] += shares;
        return shares;
    }
}

contract YieldHookTest is Test {
    using PoolIdLibrary for PoolKey;

    YieldHook public hook;
    MockERC20 public token0;
    MockERC20 public token1;
    MockVault public vault;
    address public poolManager = address(0xCAFE);

    // Hook address must have AFTER_SWAP_FLAG set: 1 << 6 = 0x0040
    address constant HOOK_ADDRESS = address(uint160(0xA0B86991C6218B36c1d19d4A2e9eB0Ce00000040));

    function setUp() public {
        // Deploy tokens
        token0 = new MockERC20("Token0", "T0", 18);
        token1 = new MockERC20("USDC", "USDC", 6);

        // Deploy vault for token1 (USDC)
        vault = new MockVault(token1);

        // Deploy hook at correct address
        bytes memory constructorArgs = abi.encode(IPoolManager(poolManager));
        deployCodeTo("YieldHook.sol:YieldHook", constructorArgs, HOOK_ADDRESS);
        hook = YieldHook(HOOK_ADDRESS);
    }

    // ──────────────────────────────────────────────
    // Hook Permissions
    // ──────────────────────────────────────────────

    function test_HookPermissions() public view {
        Hooks.Permissions memory permissions = hook.getHookPermissions();

        // YieldHook only needs afterSwap
        assertFalse(permissions.beforeSwap, "beforeSwap should be false");
        assertTrue(permissions.afterSwap, "afterSwap should be true");
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
    }

    function test_PoolManagerAddress() public view {
        assertEq(address(hook.poolManager()), poolManager, "Pool manager address should match");
    }

    // ──────────────────────────────────────────────
    // afterSwap - Empty hookData
    // ──────────────────────────────────────────────

    function test_AfterSwap_EmptyHookData_NoOp() public {
        PoolKey memory key = _createTestPoolKey();
        SwapParams memory params = SwapParams({
            zeroForOne: true,
            amountSpecified: -1000000, // exactInput
            sqrtPriceLimitX96: 0
        });
        BalanceDelta delta = BalanceDeltaLibrary.ZERO_DELTA;

        vm.prank(poolManager);
        (bytes4 selector, int128 returnDelta) = hook.afterSwap(address(this), key, params, delta, "");

        assertEq(selector, IHooks.afterSwap.selector, "Should return correct selector");
        assertEq(returnDelta, 0, "Should return 0 delta");
    }

    // ──────────────────────────────────────────────
    // afterSwap - Zero vault address
    // ──────────────────────────────────────────────

    function test_AfterSwap_ZeroVault_NoOp() public {
        PoolKey memory key = _createTestPoolKey();
        SwapParams memory params = SwapParams({
            zeroForOne: true,
            amountSpecified: -1000000,
            sqrtPriceLimitX96: 0
        });
        BalanceDelta delta = BalanceDeltaLibrary.ZERO_DELTA;

        // Encode recipient + zero vault
        bytes memory hookData = abi.encode(address(0xBEEF), address(0));

        vm.prank(poolManager);
        (bytes4 selector, int128 returnDelta) = hook.afterSwap(address(this), key, params, delta, hookData);

        assertEq(selector, IHooks.afterSwap.selector, "Should return correct selector");
        assertEq(returnDelta, 0, "Should return 0 delta");
    }

    // ──────────────────────────────────────────────
    // Helpers
    // ──────────────────────────────────────────────

    function _createTestPoolKey() internal view returns (PoolKey memory) {
        return PoolKey({
            currency0: Currency.wrap(address(token0)),
            currency1: Currency.wrap(address(token1)),
            fee: 3000,
            tickSpacing: 60,
            hooks: IHooks(address(hook))
        });
    }
}
