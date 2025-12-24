import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;

  const deployedWeth = await deploy("wETH", {
    from: deployer,
    log: true,
  });

  const deployedWusdt = await deploy("wUSDT", {
    from: deployer,
    log: true,
  });

  const deployedSwap = await deploy("OpaqueSwap", {
    from: deployer,
    args: [deployedWeth.address, deployedWusdt.address],
    log: true,
  });

  console.log("wETH contract:", deployedWeth.address);
  console.log("wUSDT contract:", deployedWusdt.address);
  console.log("OpaqueSwap contract:", deployedSwap.address);
};

export default func;
func.id = "deploy_opaqueSwap";
func.tags = ["OpaqueSwap"];
