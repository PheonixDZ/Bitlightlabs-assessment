const { ethers } = require("ethers");
const { CHAIN_ID, RPC_URLS, ADDRESSES } = require("../config/contracts");
const ErrorHandler = require("./errorHandler");

const dETHAbi = require("../../lib/abis/dETH.json");
const sETHAbi = require("../../lib/abis/sETH.json");
const governanceAbi = require("../../lib/abis/governance.json");
const stakingDashboardAbi = require("../../lib/abis/stakingDashboard.json");

const SEPOLIA_CHAIN_ID = 11155111;
// WETH9 on Sepolia
const SEPOLIA_WETH = "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14";

const RPC_TIMEOUT_MS = Number(process.env.RPC_TIMEOUT_MS) || 8000;

const ERC20_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
];

const getReferenceTokenAddress = () =>
  process.env.REFERENCE_TOKEN_ADDRESS || (CHAIN_ID === SEPOLIA_CHAIN_ID ? SEPOLIA_WETH : "");

const withTimeout = (promise, label) => {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(
      () => reject(new ErrorHandler(`${label} timed out after ${RPC_TIMEOUT_MS}ms`, 504)),
      RPC_TIMEOUT_MS
    );
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
};

const toHttpError = (error, context) => {
  if (error instanceof ErrorHandler) return error;
  switch (error.code) {
    case "CALL_EXCEPTION":
      return new ErrorHandler(`${context}: contract call reverted (${error.shortMessage || error.message})`, 502);
    case "BAD_DATA":
      return new ErrorHandler(`${context}: contract returned unexpected data`, 502);
    case "NETWORK_ERROR":
    case "SERVER_ERROR":
    case "TIMEOUT":
      return new ErrorHandler(`${context}: RPC unavailable (${error.shortMessage || error.message})`, 503);
    default:
      return new ErrorHandler(`${context}: ${error.shortMessage || error.message}`, 500);
  }
};

let activeProvider;
let activeRpcUrl;

const getProvider = async () => {
  if (activeProvider) return { provider: activeProvider, rpcUrl: activeRpcUrl };

  const failures = [];
  for (const url of RPC_URLS) {
    const host = new URL(url).host;
    const candidate = new ethers.JsonRpcProvider(url, CHAIN_ID, { staticNetwork: true });
    try {
      const chainId = Number(await withTimeout(candidate.send("eth_chainId", []), `RPC ${host}`));
      if (chainId !== CHAIN_ID) {
        failures.push(`${host}: chain id ${chainId} does not match CHAIN_ID ${CHAIN_ID}`);
        candidate.destroy();
        continue;
      }
      activeProvider = candidate;
      activeRpcUrl = url;
      return { provider: activeProvider, rpcUrl: activeRpcUrl };
    } catch (error) {
      failures.push(`${host}: ${error.shortMessage || error.message}`);
      candidate.destroy();
    }
  }

  throw new ErrorHandler(`No usable RPC endpoint. Tried: ${failures.join("; ")}`, 503);
};

const resetProviderOnNetworkError = (error) => {
  if (error && ["NETWORK_ERROR", "SERVER_ERROR", "TIMEOUT"].includes(error.code)) {
    activeProvider = undefined;
    activeRpcUrl = undefined;
  }
};

const assertContractDeployed = async (provider, address, label) => {
  const code = await withTimeout(provider.getCode(address), `${label} getCode`);
  if (code === "0x") {
    throw new ErrorHandler(`${label}: no contract deployed at ${address} on chain ${CHAIN_ID}`, 404);
  }
};

const readErc20 = async (address) => {
  if (!ethers.isAddress(address)) {
    throw new ErrorHandler(`Invalid contract address: ${address}`, 400);
  }
  const checksummed = ethers.getAddress(address);

  try {
    const { provider } = await getProvider();
    await assertContractDeployed(provider, checksummed, "ERC-20");

    const token = new ethers.Contract(checksummed, ERC20_ABI, provider);
    const [name, symbol, decimals, totalSupply, ethBalance, blockNumber] = await withTimeout(
      Promise.all([
        token.name(),
        token.symbol(),
        token.decimals(),
        token.totalSupply(),
        provider.getBalance(checksummed),
        provider.getBlockNumber(),
      ]),
      "ERC-20 read"
    );

    return {
      address: checksummed,
      name,
      symbol,
      decimals: Number(decimals),
      totalSupply: ethers.formatUnits(totalSupply, decimals),
      totalSupplyRaw: totalSupply.toString(),
      contractETHBalance: ethers.formatEther(ethBalance),
      contractETHBalanceRaw: ethBalance.toString(),
      blockNumber,
    };
  } catch (error) {
    resetProviderOnNetworkError(error);
    throw toHttpError(error, `ERC-20 read of ${checksummed}`);
  }
};

const PROTOCOL_READERS = {
  dETH: {
    abi: dETHAbi,
    read: async (c) => {
      const [totalSupply, contractETH] = await Promise.all([c.totalSupply(), c.getContractETHBalance()]);
      return { totalSupply: ethers.formatEther(totalSupply), contractETHBalance: ethers.formatEther(contractETH) };
    },
  },
  sETH: {
    abi: sETHAbi,
    read: async (c) => {
      const [totalSupply, totalStaked, totalStakers] = await Promise.all([
        c.totalSupply(),
        c.totalStaked(),
        c.totalStakers(),
      ]);
      return {
        totalSupply: ethers.formatEther(totalSupply),
        totalStaked: ethers.formatEther(totalStaked),
        totalStakers: totalStakers.toString(),
      };
    },
  },
  governance: {
    abi: governanceAbi,
    read: async (c) => {
      const [proposalCount, quorum, votingPeriod] = await Promise.all([
        c.proposalCount(),
        c.quorum(),
        c.votingPeriod(),
      ]);
      return {
        proposalCount: proposalCount.toString(),
        quorum: ethers.formatEther(quorum),
        votingPeriodSeconds: Number(votingPeriod),
      };
    },
  },
  stakingDashboard: {
    abi: stakingDashboardAbi,
    read: async (c) => {
      const overview = await c.getStakingOverview();
      return {
        totalETHDeposited: ethers.formatEther(overview.totalETHDeposited),
        totalETHStaked: ethers.formatEther(overview.totalETHStaked),
        totalStakers: overview.totalStakers.toString(),
        averageStakeAmount: ethers.formatEther(overview.averageStakeAmount),
      };
    },
  },
};

const readProtocolContract = async (provider, key) => {
  const address = ADDRESSES[key];
  if (!address) {
    return { configured: false, note: "Address not set in environment" };
  }
  if (!ethers.isAddress(address)) {
    return { configured: true, address, error: "Configured address is not a valid Ethereum address" };
  }

  try {
    await assertContractDeployed(provider, address, key);
    const contract = new ethers.Contract(address, PROTOCOL_READERS[key].abi, provider);
    const data = await withTimeout(PROTOCOL_READERS[key].read(contract), `${key} read`);
    return { configured: true, deployed: true, address, ...data };
  } catch (error) {
    resetProviderOnNetworkError(error);
    const httpError = toHttpError(error, key);
    return {
      configured: true,
      deployed: httpError.statusCode !== 404,
      address,
      error: httpError.message,
    };
  }
};

const getOnchainSummary = async () => {
  const { provider, rpcUrl } = await getProvider();
  const blockNumber = await withTimeout(provider.getBlockNumber(), "getBlockNumber").catch((error) => {
    resetProviderOnNetworkError(error);
    throw toHttpError(error, "getBlockNumber");
  });

  const protocolKeys = Object.keys(PROTOCOL_READERS);
  const referenceAddress = getReferenceTokenAddress();

  const [protocolResults, reference] = await Promise.all([
    Promise.all(protocolKeys.map((key) => readProtocolContract(provider, key))),
    referenceAddress
      ? readErc20(referenceAddress)
          .then((token) => ({
            ...token,
            fullyBacked: BigInt(token.contractETHBalanceRaw) >= BigInt(token.totalSupplyRaw),
          }))
          .catch((error) => ({ address: referenceAddress, error: error.message }))
      : Promise.resolve({ note: "Set REFERENCE_TOKEN_ADDRESS to read a reference token on this chain" }),
  ]);

  return {
    network: { chainId: CHAIN_ID, rpcHost: new URL(rpcUrl).host, blockNumber },
    protocol: Object.fromEntries(protocolKeys.map((key, i) => [key, protocolResults[i]])),
    reference,
  };
};

module.exports = { getOnchainSummary, readErc20 };
