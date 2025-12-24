import { task } from "hardhat/config";
import type { TaskArguments } from "hardhat/types";

/**
 * Example:
 *   - npx hardhat --network localhost swap:addresses
 *   - npx hardhat --network sepolia swap:addresses
 */
task("swap:addresses", "Prints the swap and token addresses").setAction(async function (_args: TaskArguments, hre) {
  const { deployments } = hre;

  const swap = await deployments.get("OpaqueSwap");
  const weth = await deployments.get("wETH");
  const wusdt = await deployments.get("wUSDT");

  console.log("OpaqueSwap:", swap.address);
  console.log("wETH:", weth.address);
  console.log("wUSDT:", wusdt.address);
});

/**
 * Example:
 *   - npx hardhat --network localhost swap:set-operator --token weth --operator 0x... --until 1730000000
 */
task("swap:set-operator", "Sets operator on a token")
  .addParam("token", "Token: weth or wusdt")
  .addParam("operator", "Operator address")
  .addParam("until", "Unix timestamp (uint48)")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers, deployments } = hre;
    const tokenKey = String(taskArguments.token).toLowerCase() === "weth" ? "wETH" : "wUSDT";
    const tokenDeployment = await deployments.get(tokenKey);
    const signer = (await ethers.getSigners())[0];
    const token = await ethers.getContractAt(tokenKey, tokenDeployment.address);

    const tx = await token.connect(signer).setOperator(taskArguments.operator, taskArguments.until);
    console.log(`Wait for tx:${tx.hash}...`);
    const receipt = await tx.wait();
    console.log(`tx:${tx.hash} status=${receipt?.status}`);
  });

/**
 * Example:
 *   - npx hardhat --network localhost swap:mint --token weth --to 0x... --amount 1000000
 */
task("swap:mint", "Mints tokens to an address")
  .addParam("token", "Token: weth or wusdt")
  .addParam("to", "Recipient address")
  .addParam("amount", "Amount in base units (uint64)")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers, deployments } = hre;
    const tokenKey = String(taskArguments.token).toLowerCase() === "weth" ? "wETH" : "wUSDT";
    const tokenDeployment = await deployments.get(tokenKey);
    const signer = (await ethers.getSigners())[0];
    const token = await ethers.getContractAt(tokenKey, tokenDeployment.address);

    const amount = BigInt(taskArguments.amount);
    const tx = await token.connect(signer).mint(taskArguments.to, amount);
    console.log(`Wait for tx:${tx.hash}...`);
    const receipt = await tx.wait();
    console.log(`tx:${tx.hash} status=${receipt?.status}`);
  });

/**
 * Example:
 *   - npx hardhat --network localhost swap:weth-to-wusdt --amount 1000000
 */
task("swap:weth-to-wusdt", "Swaps encrypted wETH to wUSDT")
  .addParam("amount", "Amount in base units (uint64)")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers, deployments, fhevm } = hre;
    await fhevm.initializeCLIApi();

    const swapDeployment = await deployments.get("OpaqueSwap");
    const signer = (await ethers.getSigners())[0];
    const swap = await ethers.getContractAt("OpaqueSwap", swapDeployment.address);

    const amount = BigInt(taskArguments.amount);
    const encryptedInput = await fhevm
      .createEncryptedInput(swapDeployment.address, signer.address)
      .add64(amount)
      .encrypt();

    const tx = await swap.connect(signer).swapWethForWusdt(encryptedInput.handles[0], encryptedInput.inputProof);
    console.log(`Wait for tx:${tx.hash}...`);
    const receipt = await tx.wait();
    console.log(`tx:${tx.hash} status=${receipt?.status}`);
  });

/**
 * Example:
 *   - npx hardhat --network localhost swap:wusdt-to-weth --amount 3100000
 */
task("swap:wusdt-to-weth", "Swaps encrypted wUSDT to wETH")
  .addParam("amount", "Amount in base units (uint64)")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers, deployments, fhevm } = hre;
    await fhevm.initializeCLIApi();

    const swapDeployment = await deployments.get("OpaqueSwap");
    const signer = (await ethers.getSigners())[0];
    const swap = await ethers.getContractAt("OpaqueSwap", swapDeployment.address);

    const amount = BigInt(taskArguments.amount);
    const encryptedInput = await fhevm
      .createEncryptedInput(swapDeployment.address, signer.address)
      .add64(amount)
      .encrypt();

    const tx = await swap.connect(signer).swapWusdtForWeth(encryptedInput.handles[0], encryptedInput.inputProof);
    console.log(`Wait for tx:${tx.hash}...`);
    const receipt = await tx.wait();
    console.log(`tx:${tx.hash} status=${receipt?.status}`);
  });
