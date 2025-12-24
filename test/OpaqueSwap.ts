import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { ethers, fhevm } from "hardhat";
import { expect } from "chai";
import { FhevmType } from "@fhevm/hardhat-plugin";
import { OpaqueSwap, OpaqueSwap__factory, wETH, wETH__factory, wUSDT, wUSDT__factory } from "../types";

type Signers = {
  deployer: HardhatEthersSigner;
  alice: HardhatEthersSigner;
};

const RATE = 3100n;
const UNIT = 1_000_000n;

async function deployFixture() {
  const wethFactory = (await ethers.getContractFactory("wETH")) as wETH__factory;
  const wusdtFactory = (await ethers.getContractFactory("wUSDT")) as wUSDT__factory;
  const swapFactory = (await ethers.getContractFactory("OpaqueSwap")) as OpaqueSwap__factory;

  const weth = (await wethFactory.deploy()) as wETH;
  const wusdt = (await wusdtFactory.deploy()) as wUSDT;
  const swap = (await swapFactory.deploy(await weth.getAddress(), await wusdt.getAddress())) as OpaqueSwap;

  return { weth, wusdt, swap };
}

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

describe("OpaqueSwap", function () {
  let signers: Signers;
  let weth: wETH;
  let wusdt: wUSDT;
  let swap: OpaqueSwap;

  before(async function () {
    const ethSigners: HardhatEthersSigner[] = await ethers.getSigners();
    signers = { deployer: ethSigners[0], alice: ethSigners[1] };
  });

  beforeEach(async function () {
    if (!fhevm.isMock) {
      console.warn("This hardhat test suite cannot run on Sepolia Testnet");
      this.skip();
    }

    ({ weth, wusdt, swap } = await deployFixture());

    await weth.mint(signers.alice.address, 5n * UNIT);
    await wusdt.mint(signers.alice.address, 6200n * UNIT);

    await weth.mint(await swap.getAddress(), 20n * UNIT);
    await wusdt.mint(await swap.getAddress(), 62000n * UNIT);

    const latestBlock = await ethers.provider.getBlock("latest");
    const until = (latestBlock?.timestamp || 0) + 3600;

    await weth.connect(signers.alice).setOperator(await swap.getAddress(), until);
    await wusdt.connect(signers.alice).setOperator(await swap.getAddress(), until);
  });

  it("swaps wETH for wUSDT", async function () {
    const amountIn = 2n * UNIT;
    const swapAddress = await swap.getAddress();
    const wethAddress = await weth.getAddress();
    const wusdtAddress = await wusdt.getAddress();

    const beforeWeth = await decryptBalance(weth, wethAddress, signers.alice);
    const beforeWusdt = await decryptBalance(wusdt, wusdtAddress, signers.alice);

    const encryptedInput = await fhevm
      .createEncryptedInput(swapAddress, signers.alice.address)
      .add64(amountIn)
      .encrypt();

    const tx = await swap
      .connect(signers.alice)
      .swapWethForWusdt(encryptedInput.handles[0], encryptedInput.inputProof);
    await tx.wait();

    const afterWeth = await decryptBalance(weth, wethAddress, signers.alice);
    const afterWusdt = await decryptBalance(wusdt, wusdtAddress, signers.alice);

    expect(afterWeth).to.equal(beforeWeth - amountIn);
    expect(afterWusdt).to.equal(beforeWusdt + amountIn * RATE);
  });

  it("swaps wUSDT for wETH", async function () {
    const amountIn = 6200n * UNIT;
    const swapAddress = await swap.getAddress();
    const wethAddress = await weth.getAddress();
    const wusdtAddress = await wusdt.getAddress();

    const beforeWeth = await decryptBalance(weth, wethAddress, signers.alice);
    const beforeWusdt = await decryptBalance(wusdt, wusdtAddress, signers.alice);

    const encryptedInput = await fhevm
      .createEncryptedInput(swapAddress, signers.alice.address)
      .add64(amountIn)
      .encrypt();

    const tx = await swap
      .connect(signers.alice)
      .swapWusdtForWeth(encryptedInput.handles[0], encryptedInput.inputProof);
    await tx.wait();

    const afterWeth = await decryptBalance(weth, wethAddress, signers.alice);
    const afterWusdt = await decryptBalance(wusdt, wusdtAddress, signers.alice);

    expect(afterWeth).to.equal(beforeWeth + amountIn / RATE);
    expect(afterWusdt).to.equal(beforeWusdt - amountIn);
  });
});
