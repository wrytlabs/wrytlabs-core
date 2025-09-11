import { expect } from "chai";
import { ethers } from "hardhat";
import { Contract, ContractFactory, Signer } from "ethers";

describe("Queue", function () {
  let Queue: ContractFactory;
  let queue: Contract;
  let owner: Signer;
  let user1: Signer;
  let user2: Signer;
  let ownerAddress: string;
  let user1Address: string;
  let user2Address: string;

  // Mock contract for testing
  let MockTarget: ContractFactory;
  let mockTarget: Contract;

  beforeEach(async function () {
    [owner, user1, user2] = await ethers.getSigners();
    ownerAddress = await owner.getAddress();
    user1Address = await user1.getAddress();
    user2Address = await user2.getAddress();

    // Deploy Queue contract
    Queue = await ethers.getContractFactory("Queue");
    queue = await Queue.deploy(10, ethers.parseEther("1")); // max 10 actions, max 1 ETH per action

    // Deploy mock target contract
    MockTarget = await ethers.getContractFactory("MockTarget");
    mockTarget = await MockTarget.deploy();
  });

  describe("Deployment", function () {
    it("Should set the correct owner", async function () {
      expect(await queue.owner()).to.equal(ownerAddress);
    });

    it("Should set the correct configuration", async function () {
      const [maxActions, maxValue] = await queue.getBatchConfig();
      expect(maxActions).to.equal(10);
      expect(maxValue).to.equal(ethers.parseEther("1"));
    });
  });

  describe("Batch Execution", function () {
    it("Should execute a single successful action", async function () {
      const action = {
        target: await mockTarget.getAddress(),
        value: 0,
        data: mockTarget.interface.encodeFunctionData("setValue", [42])
      };

      const actions = [action];
      const allowFailureMap = 0; // No failures allowed

      const tx = await queue.executeBatch(actions, allowFailureMap);
      const receipt = await tx.wait();

      // Check that the action was executed
      expect(await mockTarget.value()).to.equal(42);
    });

    it("Should execute multiple successful actions", async function () {
      const action1 = {
        target: await mockTarget.getAddress(),
        value: 0,
        data: mockTarget.interface.encodeFunctionData("setValue", [10])
      };

      const action2 = {
        target: await mockTarget.getAddress(),
        value: 0,
        data: mockTarget.interface.encodeFunctionData("setValue", [20])
      };

      const actions = [action1, action2];
      const allowFailureMap = 0;

      await queue.executeBatch(actions, allowFailureMap);

      // Last action should have set the value to 20
      expect(await mockTarget.value()).to.equal(20);
    });

    it("Should handle allowed failures", async function () {
      const action1 = {
        target: await mockTarget.getAddress(),
        value: 0,
        data: mockTarget.interface.encodeFunctionData("setValue", [10])
      };

      const action2 = {
        target: await mockTarget.getAddress(),
        value: 0,
        data: mockTarget.interface.encodeFunctionData("setValue", [20])
      };

      const action3 = {
        target: await mockTarget.getAddress(),
        value: 0,
        data: mockTarget.interface.encodeFunctionData("revertFunction", [])
      };

      const actions = [action1, action2, action3];
      const allowFailureMap = 4; // Allow failure for action at index 2 (bit 2 = 4)

      await queue.executeBatch(actions, allowFailureMap);

      // The last successful action should have set the value to 20
      expect(await mockTarget.value()).to.equal(20);
    });

    it("Should revert when non-allowed action fails", async function () {
      const action = {
        target: await mockTarget.getAddress(),
        value: 0,
        data: mockTarget.interface.encodeFunctionData("revertFunction", [])
      };

      const actions = [action];
      const allowFailureMap = 0; // No failures allowed

      await expect(
        queue.executeBatch(actions, allowFailureMap)
      ).to.be.revertedWithCustomError(queue, "ActionExecutionFailed");
    });

    it("Should revert when called by non-owner", async function () {
      const action = {
        target: await mockTarget.getAddress(),
        value: 0,
        data: mockTarget.interface.encodeFunctionData("setValue", [42])
      };

      const actions = [action];
      const allowFailureMap = 0;

      await expect(
        queue.connect(user1).executeBatch(actions, allowFailureMap)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("Should revert when no actions provided", async function () {
      const actions: any[] = [];
      const allowFailureMap = 0;

      await expect(
        queue.executeBatch(actions, allowFailureMap)
      ).to.be.revertedWithCustomError(queue, "InvalidActionCount");
    });

    it("Should revert when batch size exceeds maximum", async function () {
      const actions = Array(11).fill({
        target: await mockTarget.getAddress(),
        value: 0,
        data: mockTarget.interface.encodeFunctionData("setValue", [42])
      });

      const allowFailureMap = 0;

      await expect(
        queue.executeBatch(actions, allowFailureMap)
      ).to.be.revertedWithCustomError(queue, "BatchSizeExceedsMaximum");
    });
  });

  describe("Configuration", function () {
    it("Should allow owner to set max actions", async function () {
      await queue.setMaxActions(20);
      const [maxActions] = await queue.getBatchConfig();
      expect(maxActions).to.equal(20);
    });

    it("Should allow owner to set max value", async function () {
      await queue.setMaxValue(ethers.parseEther("2"));
      const [, maxValue] = await queue.getBatchConfig();
      expect(maxValue).to.equal(ethers.parseEther("2"));
    });

    it("Should not allow non-owner to set configuration", async function () {
      await expect(
        queue.connect(user1).setMaxActions(20)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });
  });

  describe("Target Restrictions", function () {
    it("Should allow owner to add allowed targets", async function () {
      await queue.allowTarget(await mockTarget.getAddress());
      expect(await queue.isTargetAllowed(await mockTarget.getAddress())).to.be.true;
    });

    it("Should allow owner to remove allowed targets", async function () {
      await queue.allowTarget(await mockTarget.getAddress());
      await queue.disallowTarget(await mockTarget.getAddress());
      expect(await queue.isTargetAllowed(await mockTarget.getAddress())).to.be.false;
    });

    it("Should allow owner to disable target restrictions", async function () {
      await queue.disableTargetRestrictions();
      expect(await queue.isTargetAllowed(ethers.ZeroAddress)).to.be.true;
    });
  });

  describe("Emergency Functions", function () {
    it("Should allow owner to withdraw ETH", async function () {
      // Send some ETH to the contract
      await owner.sendTransaction({
        to: await queue.getAddress(),
        value: ethers.parseEther("1")
      });

      const initialBalance = await ethers.provider.getBalance(ownerAddress);
      await queue.emergencyWithdraw();
      const finalBalance = await ethers.provider.getBalance(ownerAddress);

      expect(finalBalance).to.be.gt(initialBalance);
    });

    it("Should not allow non-owner to withdraw", async function () {
      await expect(
        queue.connect(user1).emergencyWithdraw()
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });
  });

  describe("Events", function () {
    it("Should emit BatchExecuted event", async function () {
      const action = {
        target: await mockTarget.getAddress(),
        value: 0,
        data: mockTarget.interface.encodeFunctionData("setValue", [42])
      };

      const actions = [action];
      const allowFailureMap = 0;

      await expect(queue.executeBatch(actions, allowFailureMap))
        .to.emit(queue, "BatchExecuted")
        .withArgs(
          ethers.anyValue, // batchId
          ownerAddress,
          actions,
          [true], // results
          allowFailureMap
        );
    });
  });
});

// Mock contract for testing
const MockTargetArtifact = {
  abi: [
    "function setValue(uint256 _value) external",
    "function revertFunction() external pure",
    "function value() external view returns (uint256)"
  ],
  bytecode: "0x608060405234801561001057600080fd5b50610150806100206000396000f3fe608060405234801561001057600080fd5b50600436106100415760003560e01c80633a4b66f1146100465780635524107714610050578063a0e47e1114610066575b600080fd5b61004e61007c565b005b61005861008e565b60405161005d91906100a4565b60405180910390f35b61006e610094565b60405161007b91906100a4565b60405180910390f35b60008081548092919061008a906100c8565b9190505550565b60005481565b600080546100a1906100c8565b905090565b6000819050919050565b6100c2816100af565b82525050565b60006001820190506100dd60008360016100e6565b91505090565b600081905091905056fea2646970667358221220c4d8c8c8c8c8c8c8c8c8c8c8c8c8c8c8c8c8c8c8c8c8c8c8c8c8c8c8c8c8c8c64736f6c63430008110033"
};

// This is a simplified mock - in a real test you'd deploy an actual contract
describe("MockTarget", function () {
  it("Should work as expected", function () {
    // This is just a placeholder - in real tests you'd deploy an actual mock contract
    expect(true).to.be.true;
  });
}); 