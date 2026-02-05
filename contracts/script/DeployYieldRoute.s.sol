// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {YieldHook} from "../src/YieldHook.sol";
import {YieldRouter} from "../src/YieldRouter.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolSwapTest} from "@uniswap/v4-core/src/test/PoolSwapTest.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";

/// @title Deploy YieldRoute contracts to Base
/// @notice Deploys YieldHook (via CREATE2) and YieldRouter
/// @dev Requires PRIVATE_KEY env var
///
/// Target chain: Base (Chain ID 8453)
/// RPC: https://mainnet.base.org
/// Explorer: https://basescan.org
contract DeployYieldRoute is Script {
    // Deterministic CREATE2 deployer — available on all major chains + testnets
    address constant CREATE2_DEPLOYER = 0x4e59b44847b379578588920cA78FbF26c0B4956C;

    // Uniswap V4 PoolManager on Base (Chain ID 8453)
    address constant POOL_MANAGER = 0x498581fF718922c3f8e6A244956aF099B2652b2b;

    // PoolSwapTest router on Base - deploy one or use existing
    // Note: For production, use the actual V4 swap router
    address constant SWAP_ROUTER = address(0); // Will deploy new one

    // Expected chain ID for Base
    uint256 constant BASE_CHAIN_ID = 8453;

    // YieldHook only needs afterSwap (bit 6) = 0x0040
    uint160 constant HOOK_FLAGS = uint160(Hooks.AFTER_SWAP_FLAG);

    // Mask for the 14 least-significant bits (hook permission flags)
    uint160 constant FLAG_MASK = 0x3FFF;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        // Verify we are deploying to Base (or allow testnet for development)
        require(
            block.chainid == BASE_CHAIN_ID || block.chainid == 84532, // Base or Base Sepolia
            "Wrong chain: expected Base (8453) or Base Sepolia (84532)"
        );

        IPoolManager poolManager = IPoolManager(POOL_MANAGER);

        console.log("------------------------------------");
        console.log("Deploying YieldRoute contracts");
        console.log("Chain       :", block.chainid);
        console.log("PoolManager :", POOL_MANAGER);
        console.log("Deployer    :", deployer);
        console.log("------------------------------------");

        vm.startBroadcast(deployerPrivateKey);

        // 1. Deploy YieldHook via CREATE2 with mined salt
        address hookAddr = _deployYieldHook(poolManager);

        // 2. Deploy PoolSwapTest if needed (for testing)
        PoolSwapTest swapRouter;
        if (SWAP_ROUTER == address(0)) {
            swapRouter = new PoolSwapTest(poolManager);
            console.log("Deployed PoolSwapTest at:", address(swapRouter));
        } else {
            swapRouter = PoolSwapTest(SWAP_ROUTER);
            console.log("Using existing PoolSwapTest:", SWAP_ROUTER);
        }

        // 3. Deploy YieldRouter
        YieldRouter router = new YieldRouter(poolManager, swapRouter);
        console.log("Deployed YieldRouter at:", address(router));

        vm.stopBroadcast();

        console.log("------------------------------------");
        console.log("Deployment complete!");
        console.log("YieldHook   :", hookAddr);
        console.log("YieldRouter :", address(router));
        console.log("SwapRouter  :", address(swapRouter));
        console.log("------------------------------------");
    }

    function _deployYieldHook(IPoolManager poolManager) internal returns (address) {
        // Build full init code (creation code + constructor args)
        bytes memory initCode = abi.encodePacked(
            type(YieldHook).creationCode,
            abi.encode(poolManager)
        );

        bytes32 initCodeHash = keccak256(initCode);

        // Mine a salt whose CREATE2 address has exactly the right flag bits
        console.log("Mining CREATE2 salt for YieldHook (flags 0x0040)...");
        bytes32 salt = _mineSalt(initCodeHash);
        address expectedAddr = _computeAddress(salt, initCodeHash);

        console.log("Found salt  :", vm.toString(salt));
        console.log("Hook address:", expectedAddr);

        // Deploy via deterministic CREATE2 deployer
        (bool success,) = CREATE2_DEPLOYER.call(abi.encodePacked(salt, initCode));
        require(success, "CREATE2 deployment failed");

        // Verify deployment
        require(expectedAddr.code.length > 0, "No code at expected address");

        uint160 addrBits = uint160(expectedAddr);
        require(addrBits & FLAG_MASK == HOOK_FLAGS, "Hook flag bits mismatch");

        return expectedAddr;
    }

    /// @dev Iterate salts until we find one producing an address with the correct flag bits.
    function _mineSalt(bytes32 initCodeHash) internal pure returns (bytes32) {
        for (uint256 i = 0; i < 500_000; i++) {
            bytes32 salt = bytes32(i);
            address addr = _computeAddress(salt, initCodeHash);

            if (uint160(addr) & FLAG_MASK == HOOK_FLAGS) {
                return salt;
            }
        }
        revert("Could not find valid salt in 500k iterations");
    }

    /// @dev Standard CREATE2 address derivation.
    function _computeAddress(bytes32 salt, bytes32 initCodeHash) internal pure returns (address) {
        return address(
            uint160(
                uint256(
                    keccak256(
                        abi.encodePacked(bytes1(0xff), CREATE2_DEPLOYER, salt, initCodeHash)
                    )
                )
            )
        );
    }
}
