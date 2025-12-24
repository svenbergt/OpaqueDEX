import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { ethers, fhevm, deployments } from "hardhat";
import { expect } from "chai";
import { FhevmType } from "@fhevm/hardhat-plugin";
import { OpaqueSwap, wETH, wUSDT } from "../types";

type Signers = {
  alice: HardhatEthersSigner;
};

const RATE = 3100n;
const UNIT = 1_000_000n;

async function decryptBalance(
  token: wETH | wUSDT,
  tokenAddress: string,
  user: HardhatEthersSigner,
): Promise<bigint> {
  const encryptedBalance = await token.confidentialBalanceOf(user.address);
  if (encryptedBalance === ethers.ZeroHash) {
    return 0n;
  }
  const clear = await fhevm.userDecryptEuint(
    FhevmType.euint64,
    encryptedBalance,
    tokenAddress,
    user,
  );
  return BigInt(clear);
}

describe("OpaqueSwapSepolia", function () {
  let signers: Signers;
  let swap: OpaqueSwap;
  let weth: wETH;
  let wusdt: wUSDT;
  let swapAddress: string;
  let wethAddress: string;
  let wusdtAddress: string;
  let step: number;
  let steps: number;

  function progress(message: string) {
    console.log(`${++step}/${steps} ${message}`);
  }

  before(async function () {
    if (fhevm.isMock) {
      console.warn("This hardhat test suite can only run on Sepolia Testnet");
      this.skip();
    }

    const swapDeployment = await deployments.get("OpaqueSwap");
    const wethDeployment = await deployments.get("wETH");
    const wusdtDeployment = await deployments.get("wUSDT");

    swapAddress = swapDeployment.address;
    wethAddress = wethDeployment.address;
    wusdtAddress = wusdtDeployment.address;

    swap = await ethers.getContractAt("OpaqueSwap", swapAddress);
    weth = await ethers.getContractAt("wETH", wethAddress);
    wusdt = await ethers.getContractAt("wUSDT", wusdtAddress);

    const ethSigners: HardhatEthersSigner[] = await ethers.getSigners();
    signers = { alice: ethSigners[0] };
  });

  beforeEach(async () => {
    step = 0;
    steps = 0;
  });

  it("swaps wETH to wUSDT", async function () {
    steps = 10;
    this.timeout(4 * 40000);

    const amountIn = 1n * UNIT;

    progress("Minting liquidity to swap contract...");
    await weth.mint(swapAddress, 10n * UNIT);
    await wusdt.mint(swapAddress, 31000n * UNIT);

    progress("Minting balances to user...");
    await weth.mint(signers.alice.address, 2n * UNIT);

    const latestBlock = await ethers.provider.getBlock("latest");
    const until = (latestBlock?.timestamp || 0) + 3600;

    progress("Setting operator for swap contract...");
    await weth.connect(signers.alice).setOperator(swapAddress, until);

    progress("Reading balances before swap...");
    const beforeWeth = await decryptBalance(weth, wethAddress, signers.alice);
    const beforeWusdt = await decryptBalance(wusdt, wusdtAddress, signers.alice);

    progress("Encrypting input...");
    const encryptedInput = await fhevm
      .createEncryptedInput(swapAddress, signers.alice.address)
      .add64(amountIn)
      .encrypt();

    progress("Calling swap..." );
    const tx = await swap
      .connect(signers.alice)
      .swapWethForWusdt(encryptedInput.handles[0], encryptedInput.inputProof);
    await tx.wait();

    progress("Decrypting balances...");
    const wethBalance = await decryptBalance(weth, wethAddress, signers.alice);
    const wusdtBalance = await decryptBalance(wusdt, wusdtAddress, signers.alice);

    expect(wethBalance).to.equal(beforeWeth - amountIn);
    expect(wusdtBalance).to.equal(beforeWusdt + amountIn * RATE);
  });
});
