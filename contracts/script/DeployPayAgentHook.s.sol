// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {PayAgentHook} from "../src/PayAgentHook.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";

/// @title Deploy PayAgentHook to Base Mainnet
/// @notice Uses CREATE2 via the deterministic deployer to mine an address with correct hook flag bits.
/// @dev Requires PRIVATE_KEY env var.
///
/// Target chain: Base (Chain ID 8453)
/// RPC: https://mainnet.base.org
/// Explorer: https://basescan.org
contract DeployPayAgentHook is Script {
    // Deterministic CREATE2 deployer — available on all major chains + testnets
    address constant CREATE2_DEPLOYER = 0x4e59b44847b379578588920cA78FbF26c0B4956C;

    // Uniswap V4 PoolManager on Base (Chain ID 8453)
    address constant POOL_MANAGER = 0x498581fF718922c3f8e6A244956aF099B2652b2b;

    // Expected chain ID for Base
    uint256 constant BASE_CHAIN_ID = 8453;

    // afterInitialize (bit 12) + beforeSwap (bit 7) + afterSwap (bit 6) = 0x10C0
    uint160 constant HOOK_FLAGS = uint160(
        Hooks.AFTER_INITIALIZE_FLAG | Hooks.BEFORE_SWAP_FLAG | Hooks.AFTER_SWAP_FLAG
    );

    // Mask for the 14 least-significant bits (hook permission flags)
    uint160 constant FLAG_MASK = 0x3FFF;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        // Verify we are deploying to Base
        require(
            block.chainid == BASE_CHAIN_ID,
            "Wrong chain: expected Base (8453)"
        );

        // Build full init code (creation code + constructor args)
        bytes memory initCode = abi.encodePacked(
            type(PayAgentHook).creationCode,
            abi.encode(IPoolManager(POOL_MANAGER))
        );

        bytes32 initCodeHash = keccak256(initCode);

        // Mine a salt whose CREATE2 address has exactly the right flag bits
        console.log("Mining CREATE2 salt for hook flags 0x10C0 ...");
        bytes32 salt = _mineSalt(initCodeHash);
        address expectedAddr = _computeAddress(salt, initCodeHash);

        console.log("------------------------------------");
        console.log("Chain       : Base (8453)");
        console.log("PoolManager :", POOL_MANAGER);
        console.log("Deployer    :", deployer);
        console.log("Salt        :", vm.toString(salt));
        console.log("Hook address:", expectedAddr);
        console.log("------------------------------------");

        vm.startBroadcast(deployerPrivateKey);

        // Deploy via deterministic CREATE2 deployer
        (bool success,) = CREATE2_DEPLOYER.call(abi.encodePacked(salt, initCode));
        require(success, "CREATE2 deployment failed");

        vm.stopBroadcast();

        // Verify deployment
        require(expectedAddr.code.length > 0, "No code at expected address");

        uint160 addrBits = uint160(expectedAddr);
        require(addrBits & FLAG_MASK == HOOK_FLAGS, "Hook flag bits mismatch");

        console.log("Deployed PayAgentHook at:", expectedAddr);
    }

    /// @dev Iterate salts until we find one producing an address with the correct flag bits.
    function _mineSalt(bytes32 initCodeHash) internal pure returns (bytes32) {
        for (uint256 i = 0; i < 200_000; i++) {
            bytes32 salt = bytes32(i);
            address addr = _computeAddress(salt, initCodeHash);

            if (uint160(addr) & FLAG_MASK == HOOK_FLAGS) {
                return salt;
            }
        }
        revert("Could not find valid salt in 200k iterations");
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
