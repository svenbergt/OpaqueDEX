# OpaqueDEX

OpaqueDEX is a privacy-preserving fixed-rate swap for confidential wETH and wUSDT on Zama's FHEVM. It lets users swap
encrypted balances at a deterministic price while keeping amounts hidden on-chain, with an optional reveal in the UI.

## Project Summary

OpaqueDEX provides a simple, auditable swap path between wETH and wUSDT with a constant rate:

- 1 wETH = 3100 wUSDT (fixed, no oracle).
- Swaps are executed with encrypted values using FHE primitives.
- The frontend shows encrypted balances by default and reveals the real values only when the user explicitly decrypts.

The project focuses on privacy, deterministic pricing, and a lean developer workflow using Hardhat and Zama tooling.

## Advantages

- Confidential balances and swap amounts via FHE, reducing on-chain data leakage.
- Fixed pricing eliminates slippage and price manipulation within the swap itself.
- Simple contract surface area: no pools, no LP accounting, no oracles.
- Clear separation of read and write paths in the UI (viem for reads, ethers for writes).
- Deterministic and auditable rate logic suitable for accounting and predictable UX.

## Problems Solved

- Privacy: users can interact without exposing exact balances or swap sizes on-chain.
- Predictability: a constant rate removes price ambiguity for simple treasury or retail use cases.
- Simplicity: avoids AMM mechanics, liquidity incentives, and oracle dependencies.
- Compliance-ready UX: encrypted by default with explicit user-controlled reveal.

## How It Works

### Contracts

- `OpaqueSwap.sol` performs fixed-rate swaps between wETH and wUSDT using FHE primitives.
- `wETH.sol` and `wUSDT.sol` implement confidential transfers (IERC7984).
- Swaps use `euint64` values and `confidentialTransfer`/`confidentialTransferFrom` to keep amounts encrypted.
- View methods avoid `msg.sender` and require explicit addresses when needed.

Rate logic:

- wETH -> wUSDT uses `amountOut = amountIn * 3100`.
- wUSDT -> wETH uses `amountOut = amountIn / 3100` (integer division).

### Frontend

- React + Vite UI under `ui/`.
- Reads are done with viem; writes use ethers.
- Balances are displayed as encrypted values until the user clicks to decrypt.
- No frontend environment variables, no local storage, and no localhost network usage.

## Tech Stack

- Smart contracts: Solidity 0.8.27, Hardhat, hardhat-deploy.
- Privacy: Zama FHEVM (`@fhevm/solidity`).
- Tokens: IERC7984 confidential transfer standard.
- Frontend: React, Vite, RainbowKit, viem (read), ethers (write).
- Tooling: TypeScript, npm.

## Project Structure

```
contracts/      Smart contracts (OpaqueSwap, wETH, wUSDT)
deploy/         Deployment scripts
tasks/          Hardhat tasks
test/           Contract tests
ui/             Frontend application
artifacts/      Build artifacts
cache/          Hardhat cache
```

## Setup

Prerequisites:

- Node.js 20+
- npm

Install dependencies:

```bash
npm install
```

Frontend dependencies:

```bash
cd ui
npm install
```

## Local Development

Compile and test contracts:

```bash
npm run compile
npm run test
```

Run a local node and deploy for contract-level testing:

```bash
npx hardhat node
npx hardhat deploy --network localhost
```

Note: the frontend is designed for public networks and does not rely on localhost.

## Deployment

Create a `.env` file in the project root (deployment only):

```
INFURA_API_KEY=your_infura_key
PRIVATE_KEY=your_private_key
ETHERSCAN_API_KEY=your_etherscan_key
```

Use a private key only. Do not use a mnemonic.

Deploy to Sepolia:

```bash
npx hardhat deploy --network sepolia
```

After deployment, Hardhat generates deployment artifacts under `deployments/sepolia/`. The frontend consumes the ABI
from there.

## Frontend Usage

From `ui/`:

```bash
npm run dev
```

- Connect a wallet via RainbowKit.
- See encrypted balances first; click decrypt to reveal actual values.
- Enter encrypted amounts and submit swaps through the contract.

## Testing and Tasks

- Run all tests: `npm run test`
- Run a specific task: `npx hardhat <task-name>`
- Sepolia tests: `npx hardhat test --network sepolia`

## Security and Limitations

- Fixed-rate swaps do not reflect market price changes.
- Integer division can round down when swapping wUSDT to wETH.
- Confidential transfers depend on the FHEVM security model and relayer setup.
- No AMM pools or liquidity incentives are included.

## Future Roadmap

- Multi-asset support beyond wETH and wUSDT.
- Configurable fixed-rate updates with governance controls.
- Better UX for proof generation and encrypted input flows.
- Extended analytics with privacy-preserving aggregation.
- Audit and formal verification pass for production deployment.

## Documentation

- Contract development notes: `docs/zama_llm.md`
- Frontend relayer notes: `docs/zama_doc_relayer.md`

## License

BSD-3-Clause-Clear. See `LICENSE`.
