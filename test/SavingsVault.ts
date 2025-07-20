import { expect } from 'chai';
import { ethers, network } from 'hardhat';
import { formatEther, MaxUint256, parseEther, Signer } from 'ethers';
import { IERC20, ISavings, SavingsVault } from '../typechain';
import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import { evm_increaseTime } from './helper';

describe('SavingsVault on mainnet fork', function () {
	let vault: SavingsVault;
	let savings: ISavings;
	let zchf: IERC20;

	let user: SignerWithAddress;
	let userZCHF: SignerWithAddress;

	// TODO: Replace these with real deployed contract addresses on mainnet
	const ZCHF_ADDRESS = '0xB58E61C3098d85632Df34EecfB899A1Ed80921cB';
	const WHALE_ADDRESS = '0x5a57dD9C623e1403AF1D810673183D89724a4e0c';
	const SAVINGS_ADDRESS = '0x27d9AD987BdE08a0d083ef7e0e4043C857A17B38';

	const depositAmount = parseEther('100');

	before(async () => {
		[user] = await ethers.getSigners();

		// Attach interfaces to mainnet contracts
		savings = await ethers.getContractAt('ISavings', SAVINGS_ADDRESS);
		zchf = await ethers.getContractAt('IERC20', ZCHF_ADDRESS);

		// Deploy your vault, pointing at the mainnet ISavings contract
		const VaultFactory = await ethers.getContractFactory('SavingsVault');
		vault = await VaultFactory.deploy(ZCHF_ADDRESS, SAVINGS_ADDRESS, 'SavingsVault', 'svZCHF');

		// Approve vault to spend user's ZCHF
		await zchf.connect(user).approve(vault, MaxUint256);

		// hardhat_impersonateAccount
		await network.provider.request({
			method: 'hardhat_impersonateAccount',
			params: [WHALE_ADDRESS],
		});
		userZCHF = await ethers.getSigner(WHALE_ADDRESS);

		// Fund with eth
		await user.sendTransaction({ to: WHALE_ADDRESS, value: parseEther('1') });

		// @dev: Fund user with ZCHF on fork using impersonation or pre-fund
		// e.g. impersonate whale and transfer tokens to user
		await zchf.connect(userZCHF).transfer(user, parseEther('10000'));
	});

	it('should correct vars', async function () {
		const price = await vault.price();
		const assets = await vault.totalAssets();
		const claimed = await vault.totalClaimed();
		const supply = await vault.totalSupply();

		expect(price).to.be.equal(parseEther('1'));
		expect(assets).to.be.equal(parseEther('0'));
		expect(claimed).to.be.equal(parseEther('0'));
		expect(supply).to.be.equal(parseEther('0'));
	});

	it('should deposit and mint shares', async function () {
		// Deposit ZCHF into vault
		await expect(vault.connect(user).deposit(depositAmount, user))
			.to.emit(vault, 'Deposit')
			.withArgs(user, user, depositAmount, depositAmount);

		expect(await vault.totalAssets()).to.be.equal(depositAmount);
		expect(await vault.balanceOf(user)).to.equal(depositAmount);
	});

	it('should revert withdrawal if funds are locked', async function () {
		expect(await vault.isUnlocked()).to.be.false;
		await expect(vault.connect(user).withdraw(depositAmount, user, user)).to.be.revertedWithCustomError(vault, 'FundsLocked');
	});

	it('should have a higher price', async function () {
		await evm_increaseTime(10 * 24 * 3600);
		expect(await vault.price()).to.be.greaterThan(parseEther('1'));
	});

	it('should claim if deposit more', async function () {
		const before = await vault.balanceOf(user);
		const shares = await vault.convertToShares(depositAmount);
		await vault.connect(user).deposit(depositAmount, user);
		expect(await vault.totalClaimed()).to.be.greaterThan(0);
		expect(await vault.balanceOf(user)).to.be.lessThan(before + shares);
	});

	it('should allow withdrawal after unlock period', async function () {
		await evm_increaseTime(10 * 24 * 3600);
		await expect(vault.connect(user).withdraw(depositAmount, user, user)).to.emit(vault, 'Withdraw');
	});
});
