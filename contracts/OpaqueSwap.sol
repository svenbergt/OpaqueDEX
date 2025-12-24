// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {FHE, euint64, externalEuint64} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {IERC7984} from "@openzeppelin/confidential-contracts/interfaces/IERC7984.sol";

/// @title OpaqueSwap
/// @notice Fixed-rate swap between wETH and wUSDT using confidential transfers.
contract OpaqueSwap is ZamaEthereumConfig {
    uint64 public constant WETH_TO_WUSDT_RATE = 3100;

    IERC7984 public immutable wETH;
    IERC7984 public immutable wUSDT;

    event SwapWethForWusdt(address indexed user, euint64 amountIn, euint64 amountOut);
    event SwapWusdtForWeth(address indexed user, euint64 amountIn, euint64 amountOut);

    error InvalidTokenAddress();

    constructor(address wethAddress, address wusdtAddress) {
        if (wethAddress == address(0) || wusdtAddress == address(0)) {
            revert InvalidTokenAddress();
        }
        wETH = IERC7984(wethAddress);
        wUSDT = IERC7984(wusdtAddress);
    }

    /// @notice Swap encrypted wETH for encrypted wUSDT at a fixed rate.
    /// @param encryptedWethAmount Encrypted wETH amount input
    /// @param inputProof Proof for the encrypted input
    /// @return transferredOut Encrypted amount of wUSDT actually transferred
    function swapWethForWusdt(
        externalEuint64 encryptedWethAmount,
        bytes calldata inputProof
    ) external returns (euint64 transferredOut) {
        euint64 amountIn = FHE.fromExternal(encryptedWethAmount, inputProof);
        euint64 amountOut = FHE.mul(amountIn, WETH_TO_WUSDT_RATE);

        FHE.allowThis(amountIn);
        FHE.allowThis(amountOut);

        wETH.confidentialTransferFrom(msg.sender, address(this), amountIn);
        transferredOut = wUSDT.confidentialTransfer(msg.sender, amountOut);

        emit SwapWethForWusdt(msg.sender, amountIn, transferredOut);
    }

    /// @notice Swap encrypted wUSDT for encrypted wETH at a fixed rate.
    /// @param encryptedUsdtAmount Encrypted wUSDT amount input
    /// @param inputProof Proof for the encrypted input
    /// @return transferredOut Encrypted amount of wETH actually transferred
    function swapWusdtForWeth(
        externalEuint64 encryptedUsdtAmount,
        bytes calldata inputProof
    ) external returns (euint64 transferredOut) {
        euint64 amountIn = FHE.fromExternal(encryptedUsdtAmount, inputProof);
        euint64 amountOut = FHE.div(amountIn, WETH_TO_WUSDT_RATE);

        FHE.allowThis(amountIn);
        FHE.allowThis(amountOut);

        wUSDT.confidentialTransferFrom(msg.sender, address(this), amountIn);
        transferredOut = wETH.confidentialTransfer(msg.sender, amountOut);

        emit SwapWusdtForWeth(msg.sender, amountIn, transferredOut);
    }

    /// @notice Returns the token addresses used by this swap.
    function getTokenAddresses() external view returns (address wethAddress, address wusdtAddress) {
        return (address(wETH), address(wUSDT));
    }
}
