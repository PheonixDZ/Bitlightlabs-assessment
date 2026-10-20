// Usage:
//   node backend/scripts/deployContracts.js --compile-only
//   node backend/scripts/deployContracts.js --new-wallet
//   node backend/scripts/deployContracts.js

const fs = require("fs");
const path = require("path");
const solc = require("solc");
const { ethers } = require("ethers");

const ROOT = path.join(__dirname, "..", "..");
const ENV_PATH = path.join(ROOT, ".env");
const CONTRACTS_DIR = path.join(ROOT, "contracts");
const NODE_MODULES = path.join(ROOT, "node_modules");

require("dotenv").config({ path: ENV_PATH });

const SOURCES = ["dETH.sol", "sETH.sol", "Governance.sol", "StakingDashboard.sol"];

const compile = () => {
  const sources = Object.fromEntries(
    SOURCES.map((file) => [file, { content: fs.readFileSync(path.join(CONTRACTS_DIR, file), "utf8") }])
  );
  const input = {
    language: "Solidity",
    sources,
    settings: {
      optimizer: { enabled: true, runs: 200 },
      outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } },
    },
  };

  const findImports = (importPath) => {
    const candidates = [path.join(NODE_MODULES, importPath), path.join(CONTRACTS_DIR, importPath)];
    const found = candidates.find((candidate) => fs.existsSync(candidate));
    return found ? { contents: fs.readFileSync(found, "utf8") } : { error: `Import not found: ${importPath}` };
  };

  const output = JSON.parse(solc.compile(JSON.stringify(input), { import: findImports }));
  const errors = (output.errors || []).filter((e) => e.severity === "error");
  if (errors.length) {
    throw new Error(`Compilation failed:\n${errors.map((e) => e.formattedMessage).join("\n")}`);
  }

  const artifact = (file, name) => {
    const contract = output.contracts[file][name];
    return { abi: contract.abi, bytecode: `0x${contract.evm.bytecode.object}` };
  };

  return {
    DepositETH: artifact("dETH.sol", "DepositETH"),
    StakedETH: artifact("sETH.sol", "StakedETH"),
    Governance: artifact("Governance.sol", "Governance"),
    StakingDashboard: artifact("StakingDashboard.sol", "StakingDashboard"),
  };
};

const writeEnv = (updates) => {
  let content = fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, "utf8") : "";
  Object.entries(updates).forEach(([key, value]) => {
    const line = `${key}=${value}`;
    const pattern = new RegExp(`^${key}=.*$`, "m");
    content = pattern.test(content) ? content.replace(pattern, line) : `${content.trimEnd()}\n${line}\n`;
  });
  fs.writeFileSync(ENV_PATH, content, { mode: 0o600 });
  fs.chmodSync(ENV_PATH, 0o600);
};

const newWallet = () => {
  if (process.env.DEPLOYER_PRIVATE_KEY) {
    const existing = new ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY);
    console.log(`DEPLOYER_PRIVATE_KEY already set. Deployer address: ${existing.address}`);
    return;
  }
  const wallet = ethers.Wallet.createRandom();
  writeEnv({ DEPLOYER_PRIVATE_KEY: wallet.privateKey });
  console.log("Deployer private key saved to .env");
  console.log(`Deployer address: ${wallet.address}`);
};

const deploy = async (artifacts) => {
  const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error("DEPLOYER_PRIVATE_KEY is not set (run with --new-wallet)");
  }
  const rpcUrl = process.env.RPC_URL || process.env.NEXT_PUBLIC_RPC_URL;
  const chainId = Number(process.env.CHAIN_ID || process.env.NEXT_PUBLIC_CHAIN_ID);
  if (!rpcUrl || !chainId) {
    throw new Error("Set RPC_URL (or NEXT_PUBLIC_RPC_URL) and CHAIN_ID (or NEXT_PUBLIC_CHAIN_ID) in .env");
  }

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const network = await provider.getNetwork();
  if (Number(network.chainId) !== chainId) {
    throw new Error(`RPC is on chain ${network.chainId}, expected ${chainId}`);
  }

  const wallet = new ethers.Wallet(privateKey, provider);
  const signer = new ethers.NonceManager(wallet);
  const balance = await provider.getBalance(wallet.address);
  console.log(`Deployer ${wallet.address} on chain ${chainId}, balance ${ethers.formatEther(balance)} ETH`);
  if (balance === 0n) {
    throw new Error(`Deployer ${wallet.address} has no ETH`);
  }

  const deployOne = async (name, args = []) => {
    const { abi, bytecode } = artifacts[name];
    const factory = new ethers.ContractFactory(abi, bytecode, signer);
    const contract = await factory.deploy(...args);
    console.log(`  ${name}: tx ${contract.deploymentTransaction().hash}`);
    await contract.waitForDeployment();
    const address = await contract.getAddress();
    console.log(`  ${name}: deployed at ${address}`);
    return contract;
  };

    const dETH = await deployOne("DepositETH");
  const dETHAddress = await dETH.getAddress();
  const sETH = await deployOne("StakedETH", [dETHAddress]);
  const sETHAddress = await sETH.getAddress();
  const governance = await deployOne("Governance", [sETHAddress]);
  const dashboard = await deployOne("StakingDashboard", [sETHAddress, dETHAddress]);

  const addresses = {
    NEXT_PUBLIC_DETH_ADDRESS: dETHAddress,
    NEXT_PUBLIC_SETH_ADDRESS: sETHAddress,
    NEXT_PUBLIC_GOVERNANCE_ADDRESS: await governance.getAddress(),
    NEXT_PUBLIC_STAKING_DASHBOARD_ADDRESS: await dashboard.getAddress(),
  };
  writeEnv(addresses);

  const seedAmount = ethers.parseEther(process.env.SEED_DEPOSIT_ETH || "0.01");
  if (seedAmount > 0n) {
    console.log(`Depositing and staking ${ethers.formatEther(seedAmount)} ETH`);
    await (await dETH.deposit({ value: seedAmount })).wait();
    await (await dETH.approve(sETHAddress, seedAmount)).wait();
    await (await sETH.stake(seedAmount)).wait();
  }

  return addresses;
};

const main = async () => {
  const args = process.argv.slice(2);
  if (args.includes("--new-wallet")) return newWallet();

  const artifacts = compile();
  console.log(`Compiled: ${Object.keys(artifacts).join(", ")}`);
  if (args.includes("--compile-only")) return;

  const addresses = await deploy(artifacts);
  console.log(JSON.stringify(addresses, null, 2));
};

main().catch((error) => {
  console.error(error.shortMessage || error.message);
  process.exit(1);
});
