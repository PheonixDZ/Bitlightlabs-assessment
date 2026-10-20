# CoinVault

CoinVault is a multi-chain staking and governance platform for the Ethereum ecosystem. Users can stake ETH, earn rewards, and participate in on-chain governance.

Candidates extend the existing Express API so it can read data from smart contracts. 

---

## Take-Home Assessment

### Objective

Add a new API to this shared backend that integrates with smart contracts and returns on-chain data.

### Requirements

1. Work in this repository. Do not create a new project from scratch. Implement your solution in the existing backend.
2. Add a new API named `[YourName]Apitest`. Replace `[YourName]` with your name (for example, `WesleyApitest`).
3. Fetch information from a smart contract through that API. You may use any of the contracts in this project, or another public contract of your choice.
4. No frontend is required. Logging the result to the console (or returning it from the API) is sufficient to demonstrate your work.

### Suggested approach

- Add your route, controller, and any contract-integration logic under `backend/`.
- Use `ethers.js` (already included) to read contract data.
- Contract ABIs are available in `lib/abis/`. Solidity sources are in `contracts/`.
- Register the new route in `backend/app.js`.

### Submission

Complete the task by the end of the day and share one of the following:

- A short video demonstrating the API (request and console/API response), or
- A link to a public repository with your changes

Send the video or repository link to the hiring contact.

---

## Overview

CoinVault combines:

- Staking: deposit ETH, receive dETH, stake for sETH, and track rewards
- Governance: create proposals, vote, and execute outcomes on-chain
- Backend services: Express APIs for application data, plus contract reads for on-chain state

## Technology stack

| Layer | Technologies |
| --- | --- |
| Backend | Node.js, Express |
| Blockchain | ethers.js, Solidity (ERC-20) |
| Database | MongoDB (Mongoose) |
| Frontend (reference only) | Next.js, React, TypeScript, Tailwind CSS, shadcn/ui |

## Smart contracts

The platform uses four core contracts:

| Contract | Role |
| --- | --- |
| DepositETH (dETH) | ERC-20 token minted when users deposit ETH |
| StakedETH (sETH) | ERC-20 token minted when users stake dETH |
| Governance | Proposal creation, voting, and execution |
| StakingDashboard | Staking statistics and leaderboard data |

ABIs: `lib/abis/`  
Sources: `contracts/`

## Getting started

### Prerequisites

- Node.js 18 or later (20 recommended)
- npm
- Optional: an Ethereum RPC URL (Holesky or another network) for live contract reads

### Installation

```bash
npm install
```

### Run the backend only

```bash
npm run backend
```

### Run backend and frontend together

```bash
npm run dev
```



## Project structure

```text
CoinVault/
├── app/                    # Next.js App Router pages (reference)
├── components/             # React UI components (reference)
├── contracts/              # Solidity contract sources
├── hooks/                  # Frontend React hooks
├── lib/
│   └── abis/               # Contract ABIs for ethers.js
├── public/                 # Static assets
├── styles/                 # Global styles
└── backend/                # Express API (assessment work goes here)
    ├── app.js              # Route registration
    ├── index.js            # Server entry point
    ├── config/             # Environment and database config
    ├── controllers/        # Request handlers
    ├── routes/             # API routes
    ├── models/             # Mongoose models
    ├── middlewares/        # Auth, validation, helpers
    └── utils/              # Shared utilities
```



## DarpanApitest

Read-only endpoints that use ethers.js v6 to read contract state on Sepolia.

- Route: `backend/routes/darpanApitestRoute.js`
- Controller: `backend/controllers/darpanApitestController.js`
- Contract reads: `backend/utils/darpanContractReader.js`
- Registered in `backend/app.js` at `/api/DarpanApitest`

### Setup

```bash
npm install
cp .env.example .env
```

Add the deployed contract addresses to `.env`:

```bash
NEXT_PUBLIC_DETH_ADDRESS=0x829f4f754FbaA153de98acDcc95C3A90F9F03cEB
NEXT_PUBLIC_SETH_ADDRESS=0x34e41b4BF2Ec08D8f116E4AFe69d61B17658CB7E
NEXT_PUBLIC_GOVERNANCE_ADDRESS=0xd43A59462Ce864AA1eF4c1940a1EBE8Baf845173
NEXT_PUBLIC_STAKING_DASHBOARD_ADDRESS=0xe19FB67aeFBeEC9EC12Fdc082c1D13b849d432fb
```

Start the backend:

```bash
npm run backend
```

No RPC key is needed, because the backend uses the public Sepolia RPCs listed in `backend/config/contracts.js`. Without the addresses, the endpoint still works: the `protocol` entries return `configured: false`, and the `reference` read returns live data.

Optional settings:

| Variable | Default | Purpose |
| --- | --- | --- |
| `RPC_URL` | public Sepolia RPCs | RPC to try first |
| `REFERENCE_TOKEN_ADDRESS` | Sepolia WETH9 | ERC-20 read in the `reference` section |
| `RPC_TIMEOUT_MS` | `8000` | Timeout for each RPC call |

### Endpoints

`GET /api/DarpanApitest`

- `network`: chain id, RPC host and latest block.
- `protocol`: dETH, sETH, Governance and StakingDashboard, read using the ABIs in `lib/abis/`. An entry shows `configured: false` if its address is not set, or `deployed: false` if there is no code at the address. A failure in one entry does not affect the others.
- `reference`: Sepolia WETH9 (`0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14`). Like dETH, it mints tokens 1:1 for deposited ETH, so `fullyBacked` compares `totalSupply` with the contract's ETH balance.

`GET /api/DarpanApitest/token/:address`

Returns `name`, `symbol`, `decimals`, `totalSupply` and the ETH balance for any ERC-20.

Example response from `GET /api/DarpanApitest` (shortened):

```json
{
  "success": true,
  "api": "DarpanApitest",
  "network": { "chainId": 11155111, "rpcHost": "ethereum-sepolia-rpc.publicnode.com", "blockNumber": 11952169 },
  "protocol": {
    "dETH": { "configured": true, "deployed": true, "totalSupply": "0.01", "contractETHBalance": "0.01" },
    "stakingDashboard": { "configured": true, "deployed": true, "totalETHDeposited": "0.01", "totalETHStaked": "0.01", "totalStakers": "1", "averageStakeAmount": "0.01" }
  },
  "reference": { "symbol": "WETH", "totalSupply": "193391.728772551661087949", "contractETHBalance": "193391.728772551661087949", "fullyBacked": true }
}
```

### Errors

| Case | Status |
| --- | --- |
| Invalid address | 400 |
| No contract at address | 404 |
| Call reverted or returned unexpected data | 502 |
| No reachable RPC | 503 |
| RPC call timed out | 504 |

The RPC URLs are tried in order. A URL is skipped if it fails or returns the wrong chain id. The first working one is reused until a network error occurs. Responses show only the RPC host, never the full URL.

## How it works

1. `app.js` mounts `darpanApitestRoute.js` at `/api/DarpanApitest`.
2. The controller calls `getOnchainSummary()` or `readErc20()` in `darpanContractReader.js`, logs the result, and returns it as JSON. Errors go through the existing `asyncErrorHandler` and the error middleware in `app.js`.
3. `getProvider()` creates an ethers `JsonRpcProvider` for the first RPC that responds with chain id 11155111.
4. Before reading, `assertContractDeployed()` calls `getCode`. An address with no code returns a 404 instead of a decoding error.
5. Each protocol contract is read with its ABI from `lib/abis/`. For example, StakingDashboard's `getStakingOverview()` returns total deposited, total staked, staker count and average stake. Values are formatted from wei with `formatEther`.
6. ethers error codes (`CALL_EXCEPTION`, `BAD_DATA`, `NETWORK_ERROR` and so on) are mapped to HTTP statuses in `toHttpError()`.

### Test checklist

Run these with the backend started as described in Setup.

| # | Command | Expected |
| --- | --- | --- |
| 1 | `curl localhost:4000/api/DarpanApitest` | `success: true`, all four `protocol` entries `deployed: true`, `reference.fullyBacked: true` |
| 2 | `curl localhost:4000/api/DarpanApitest/token/0x829f4f754FbaA153de98acDcc95C3A90F9F03cEB` | dETH: `"symbol": "dETH"`, `"totalSupply": "0.01"` |
| 3 | `curl localhost:4000/api/DarpanApitest/token/0x779877A7B0D9E8603169DdbD7836e478b4624789` | Sepolia LINK: `"totalSupply": "1000000000.0"` |
| 4 | `curl -i localhost:4000/api/DarpanApitest/token/0x123` | `400`, invalid address |
| 5 | `curl -i localhost:4000/api/DarpanApitest/token/0x000000000000000000000000000000000000dEaD` | `404`, no contract at address |
| 6 | `curl -i localhost:4000/api/DarpanApitest/token/0x0227628f3F023bb0B980b67D528571c95c6DaC1c` | `502`, contract is not an ERC-20 |
| 7 | `RPC_URL=http://127.0.0.1:1 npm run backend`, then repeat test 1 | Still `success: true`: the dead RPC is skipped and a public one is used |

The server console prints a `[DarpanApitest]` line for each successful request.

The existing `GET /api/leaderboard` endpoint also returns data now that the contracts are deployed.

To check the values on-chain, open the dETH address on [Sepolia Etherscan](https://sepolia.etherscan.io/address/0x829f4f754FbaA153de98acDcc95C3A90F9F03cEB). Its ETH balance is 0.01, which matches `contractETHBalance` in the response. The block number and the WETH supply change over time.

## Deployed contracts (Sepolia)

| Contract | Address |
| --- | --- |
| dETH | [0x829f4f754FbaA153de98acDcc95C3A90F9F03cEB](https://sepolia.etherscan.io/address/0x829f4f754FbaA153de98acDcc95C3A90F9F03cEB) |
| sETH | [0x34e41b4BF2Ec08D8f116E4AFe69d61B17658CB7E](https://sepolia.etherscan.io/address/0x34e41b4BF2Ec08D8f116E4AFe69d61B17658CB7E) |
| Governance | [0xd43A59462Ce864AA1eF4c1940a1EBE8Baf845173](https://sepolia.etherscan.io/address/0xd43A59462Ce864AA1eF4c1940a1EBE8Baf845173) |
| StakingDashboard | [0xe19FB67aeFBeEC9EC12Fdc082c1D13b849d432fb](https://sepolia.etherscan.io/address/0xe19FB67aeFBeEC9EC12Fdc082c1D13b849d432fb) |

The deployment was seeded with a 0.01 ETH deposit, which was then staked. No proposals exist, because `createProposal` requires at least 1 sETH.

To redeploy:

```bash
node backend/scripts/deployContracts.js --new-wallet   # writes DEPLOYER_PRIVATE_KEY to .env
# fund the printed address with Sepolia ETH
node backend/scripts/deployContracts.js
```

The script compiles the contracts and deploys them in dependency order. It writes the addresses to `.env`, then deposits and stakes `SEED_DEPOSIT_ETH` (default 0.01).

The contracts imported `ReentrancyGuard` from `@openzeppelin/contracts/security/`, which is the v4 path, but use the v5 `Ownable(msg.sender)` constructor. As a result, they did not compile against either version. The import now points to `utils/ReentrancyGuard.sol`, the v5 location. No other changes were made.
