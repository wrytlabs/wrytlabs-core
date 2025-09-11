import { expect } from 'chai';
import { ethers, network } from 'hardhat';
import { formatEther, MaxUint256, parseEther, parseUnits, Signer, ZeroAddress } from 'ethers';
import { IERC20, ISavingsZCHF, SavingsVaultZCHF_2 } from '../typechain';
import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import { evm_increaseTime } from './helper';

describe('SavingsVaultZCHF_2 on mainnet fork', function () {
	let vault: SavingsVaultZCHF_2;
	let savings: ISavingsZCHF;
	let zchf: IERC20;

	let owner: SignerWithAddress;
	let user: SignerWithAddress;
	let userZCHF: SignerWithAddress;

	// TODO: Replace these with real deployed contract addresses on mainnet
	const ZCHF_ADDRESS = '0xB58E61C3098d85632Df34EecfB899A1Ed80921cB';
	const WHALE_ADDRESS = '0xa8c4E40075D1bb3A6E3343Be55b32B8E4a5612a1';
	const SAVINGS_ADDRESS = '0x27d9AD987BdE08a0d083ef7e0e4043C857A17B38';

	const depositAmount = parseEther('10000');

	before(async () => {
		[user, owner] = await ethers.getSigners();

		// Attach interfaces to mainnet contracts
		savings = await ethers.getContractAt('ISavingsZCHF', SAVINGS_ADDRESS);
		zchf = await ethers.getContractAt('IERC20', ZCHF_ADDRESS);

		// Deploy your vault, pointing at the mainnet ISavingsZCHF contract
		const VaultFactory = await ethers.getContractFactory('SavingsVaultZCHF_2');
		vault = await VaultFactory.deploy(owner, ZCHF_ADDRESS, SAVINGS_ADDRESS, 'SavingsVaultZCHF_2', 'svZCHF');

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
		await zchf.connect(userZCHF).transfer(user, parseEther('1000000')); // <-- check balance
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

	it('should allow withdrawal', async function () {
		await expect(vault.connect(user).withdraw(depositAmount, user, user)).to.emit(vault, 'Withdraw');
	});

	it('should not allow to withdrawal without allowance', async function () {
		await expect(vault.connect(userZCHF).withdraw(depositAmount, user, user)).to.revertedWithCustomError(
			vault,
			'ERC20InsufficientAllowance'
		);
	});

	it('should allow withdrawal after approval', async function () {
		await vault.connect(user).approve(userZCHF, parseEther('100'));
		await expect(vault.connect(userZCHF).redeem(parseEther('100'), user, user)).to.emit(vault, 'Withdraw');
	});

	it('should set referral', async function () {
		const before = await vault.price();
		await vault.connect(owner).setReferral(owner, 250_000);
		const info = await vault.info();
		expect(info.referrer).to.be.eq(owner);
		expect(info.referralFeePPM).to.be.eq(250_000);

		const after = await vault.price();
		expect(after).to.be.equal(before);
	});

	it('should claim referral fee', async function () {
		await evm_increaseTime(100 * 24 * 3600);

		await vault.connect(user).deposit(0, user);
		const afterOwner = await zchf.balanceOf(owner);

		expect(afterOwner).to.be.greaterThan(0);
	});

	it('should claim calc referral fee', async function () {
		await evm_increaseTime(100 * 24 * 3600);

		const beforeOwner = await zchf.balanceOf(owner);
		const interest = await savings['accruedInterest(address)'](vault);
		await vault.connect(user).redeem(await vault.balanceOf(user), user, user);
		const afterOwner = await zchf.balanceOf(owner);

		const diff0 = (interest * 250_000n) / 1_000_000n;
		const diff1 = afterOwner - beforeOwner;

		expect(diff1).to.be.approximately(diff0, parseUnits('1', 16)); // timing issues
	});

	it('should claim calc referral fee via totalAssets', async function () {
		await vault.connect(user).deposit(depositAmount * 10n, user);
		const beforeTotal = await vault.totalAssets();

		await evm_increaseTime(100 * 24 * 3600);
		const afterTotal = await vault.totalAssets();

		const beforeOwner = await zchf.balanceOf(owner);
		const interest = await savings['accruedInterest(address)'](vault);
		await vault.connect(user).deposit(depositAmount, user);
		const afterOwner = await zchf.balanceOf(owner);

		const referralInterest = (interest * 250_000n) / 1_000_000n;
		const diffOwner = afterOwner - beforeOwner;
		const diffTotal = afterTotal - beforeTotal;

		expect((diffOwner * parseEther('1')) / diffTotal).to.be.approximately(parseEther('1') / 3n, parseUnits('1', 16));
		expect((referralInterest * parseEther('1')) / diffTotal).to.be.equal(parseEther('1') / 3n);
	});

	it('should drop referrer', async function () {
		const zeroAddress = '0x0000000000000000000000000000000000000000';
		const beforePrice = await vault.price();
		await vault.connect(owner).setReferral(zeroAddress, 0);
		const afterPrice = await vault.price();

		expect(afterPrice).to.be.greaterThanOrEqual(beforePrice);
		expect((await vault.info()).referrer).to.be.eq(zeroAddress);
		expect((await vault.info()).referralFeePPM).to.be.eq(0);
	});

	it('should check no ticks exploit', async function () {
		// deposit a high number
		const value = parseEther('800000');

		// multiple deposits and withdrawals
		for (let i = 0; i < 100; i++) {
			await vault.connect(user).deposit(value, user);
			await vault.connect(user).withdraw(value, user, user);
		}

		const infoAfter = await savings.savings(await vault.getAddress());
		const ticksAfter = await savings.currentTicks();
		// console.log({ infoAfter, ticksAfter, waiting: (infoAfter[1] - ticksAfter) / 30_000n / 3600n });
		expect((infoAfter[1] - ticksAfter) / 30_000n / 3600n).is.lessThanOrEqual(72n); // aka 3days = 72 hour.
	});
});
