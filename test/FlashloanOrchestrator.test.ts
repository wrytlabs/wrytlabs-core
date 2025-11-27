import { expect } from 'chai';
import { ethers, network } from 'hardhat';
import { formatEther, MaxUint256, parseEther, parseUnits, Signer, ZeroAddress, keccak256, solidityPacked } from 'ethers';
import { FlashloanOrchestrator, FlashloanHook_Savings, IERC20, IMorpho, SavingsVaultZCHF } from '../typechain';
import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import { ADDRESS } from '../exports/address.config';

describe('FlashloanOrchestrator with Savings Hook on mainnet fork', function () {
	let orchestrator: FlashloanOrchestrator;
	let savingsHook: FlashloanHook_Savings;
	let morpho: IMorpho;
	let svzchf: SavingsVaultZCHF;
	let zchf: IERC20;

	let owner: SignerWithAddress;
	let user: SignerWithAddress;
	let whale: SignerWithAddress;

	// Use addresses from config
	const MORPHO_BLUE = ADDRESS[1].morphoBlue;
	const SAVINGS_VAULT_ZCHF = ADDRESS[1].savingsVaultZCHF;
	const ZCHF_ADDRESS = ADDRESS[1].zchf;
	const MARKET_ID = ADDRESS[1].marketZCHFSVZCHF;
	const WHALE_ADDRESS = '0x5a57dD9C623e1403AF1D810673183D89724a4e0c'; // ZCHF whale

	const flashAmount = parseEther('1000'); // 1000 ZCHF
	const userAmount = parseEther('100'); // 100 ZCHF

	before(async () => {
		// Setup signers
		[owner, user] = await ethers.getSigners();

		// Get contract instances
		morpho = await ethers.getContractAt('IMorpho', MORPHO_BLUE);
		svzchf = await ethers.getContractAt('SavingsVaultZCHF', SAVINGS_VAULT_ZCHF);
		zchf = await ethers.getContractAt('IERC20', ZCHF_ADDRESS);

		console.log('📋 Contract Addresses:');
		console.log('  Morpho Blue:', MORPHO_BLUE);
		console.log('  Savings Vault:', SAVINGS_VAULT_ZCHF);
		console.log('  ZCHF:', ZCHF_ADDRESS);
		console.log('  Market ID:', MARKET_ID);
	});

	describe('Deployment', () => {
		it('Should deploy FlashloanOrchestrator successfully', async () => {
			const OrchestratorFactory = await ethers.getContractFactory('FlashloanOrchestrator');
			orchestrator = await OrchestratorFactory.deploy(MORPHO_BLUE);

			expect(await orchestrator.getAddress()).to.not.equal(ZeroAddress);
			console.log('✅ FlashloanOrchestrator deployed at:', await orchestrator.getAddress());
		});

		it('Should deploy FlashloanHook_Savings successfully', async () => {
			const HookFactory = await ethers.getContractFactory('FlashloanHook_Savings');
			savingsHook = await HookFactory.deploy(await orchestrator.getAddress(), MORPHO_BLUE, SAVINGS_VAULT_ZCHF, MARKET_ID);

			expect(await savingsHook.getAddress()).to.not.equal(ZeroAddress);
			console.log('✅ FlashloanHook_Savings deployed at:', await savingsHook.getAddress());
		});

		it('Should verify hook is properly connected to orchestrator', async () => {
			const hookOrchestrator = await savingsHook.orchestrator();
			expect(hookOrchestrator).to.equal(await orchestrator.getAddress());
			console.log('✅ Hook correctly connected to orchestrator');
		});

		it('Should verify hook market configuration', async () => {
			const market = await savingsHook.market();
			expect(market.loanToken).to.not.equal(ZeroAddress);
			expect(market.collateralToken).to.not.equal(ZeroAddress);
			console.log('✅ Hook market configured:');
			console.log('  Loan Token:', market.loanToken);
			console.log('  Collateral Token:', market.collateralToken);
		});
	});

	describe('Setup for Testing', () => {
		before(async () => {
			// Impersonate ZCHF whale for funding
			await network.provider.request({
				method: 'hardhat_impersonateAccount',
				params: [WHALE_ADDRESS],
			});
			whale = await ethers.getSigner(WHALE_ADDRESS);

			// Fund whale with ETH for gas
			await owner.sendTransaction({
				to: WHALE_ADDRESS,
				value: parseEther('10'),
			});
		});

		it('Should fund user with ZCHF tokens', async () => {
			const fundAmount = parseEther('10000'); // 10k ZCHF for testing

			// Transfer ZCHF from whale to user
			await zchf.connect(whale).transfer(user.address, fundAmount);

			const userBalance = await zchf.balanceOf(user.address);
			expect(userBalance).to.be.gte(fundAmount);

			console.log('✅ User funded with', formatEther(userBalance), 'ZCHF');
		});

		it('Should approve orchestrator to spend user tokens', async () => {
			await zchf.connect(user).approve(await orchestrator.getAddress(), MaxUint256);
			console.log('✅ User approved orchestrator for ZCHF spending');
		});
	});

	describe('Basic Functionality', () => {
		it('Should execute a simple flashloan without actions', async () => {
			await expect(
				orchestrator.connect(user).execute(
					[], // no tokens
					[], // no amounts
					ZCHF_ADDRESS, // flash token
					flashAmount, // flash amount
					[] // no actions
				)
			).to.be.revertedWithCustomError(orchestrator, 'NoActionsProvided');
			console.log('✅ Correctly reverted with NoActionsProvided for empty actions');
		});

		it('Should validate input parameters', async () => {
			// Test mismatched array lengths
			await expect(
				orchestrator.connect(user).execute(
					[ZCHF_ADDRESS], // 1 token
					[], // 0 amounts - mismatch
					ZCHF_ADDRESS,
					flashAmount,
					[
						{
							target: await savingsHook.getAddress(),
							value: 0,
							data: '0x',
						},
					]
				)
			).to.be.revertedWithCustomError(orchestrator, 'ArrayLengthMismatch');

			// Test zero flash token
			await expect(
				orchestrator.connect(user).execute(
					[],
					[],
					ZeroAddress, // invalid flash token
					flashAmount,
					[
						{
							target: await savingsHook.getAddress(),
							value: 0,
							data: '0x',
						},
					]
				)
			).to.be.reverted;

			console.log('✅ Input validation working correctly');
		});
	});

	describe('Savings Hook Integration', () => {
		it('Should execute increase leverage operation', async () => {
			// Encode increase leverage opcode
			const increaseOpcode = 0; // INCREASE_LEVERAGE
			const hookData = ethers.AbiCoder.defaultAbiCoder().encode(['uint8'], [increaseOpcode]);

			// User provides some ZCHF as collateral
			const userTokens = [ZCHF_ADDRESS];
			const userAmounts = [userAmount];

			const action = {
				target: await savingsHook.getAddress(),
				value: 0,
				data: hookData,
			};

			// Get initial balances
			const initialZCHFBalance = await zchf.balanceOf(user.address);

			console.log('🚀 Executing increase leverage...');
			console.log('  User ZCHF balance before:', formatEther(initialZCHFBalance));
			console.log('  Flash amount:', formatEther(flashAmount));
			console.log('  User providing:', formatEther(userAmount), 'ZCHF');

			// Auth
			await morpho.connect(user).setAuthorization(await savingsHook.getAddress(), true);

			// Execute the flashloan
			const tx = await orchestrator.connect(user).execute(
				userTokens,
				userAmounts,
				ZCHF_ADDRESS, // flash ZCHF
				flashAmount,
				[action]
			);

			const receipt = await tx.wait();
			console.log('✅ Transaction successful, gas used:', receipt?.gasUsed.toString());

			// Check final balances
			const finalZCHFBalance = await zchf.balanceOf(user.address);
			console.log('  User ZCHF balance after:', formatEther(finalZCHFBalance));

			// User should have less ZCHF (spent userAmount)
			expect(finalZCHFBalance).to.be.lt(initialZCHFBalance);
		});

		it('Should have proper state after execution', async () => {
			// Check that orchestrator state is clean
			expect(await orchestrator.sender()).to.equal(ZeroAddress);
			expect(await orchestrator.flashToken()).to.equal(ZeroAddress);
			expect(await orchestrator.flashAmount()).to.equal(0);

			console.log('✅ Orchestrator state properly cleaned after execution');
		});

		it('Should emit Executed event', async () => {
			const increaseOpcode = 0;
			const hookData = ethers.AbiCoder.defaultAbiCoder().encode(['uint8'], [increaseOpcode]);

			const action = {
				target: await savingsHook.getAddress(),
				value: 0,
				data: hookData,
			};

			await expect(orchestrator.connect(user).execute([ZCHF_ADDRESS], [userAmount], ZCHF_ADDRESS, flashAmount, [action]))
				.to.emit(orchestrator, 'Executed')
				.withArgs(user.address, await savingsHook.getAddress());

			console.log('✅ Executed event emitted correctly');
		});
	});

	describe('State Variable Access', () => {
		it('Should allow reading execution state during callback', async () => {
			// This would be tested by creating a custom hook that reads state
			// For now, just verify the getters exist and return default values
			expect(await orchestrator.sender()).to.equal(ZeroAddress);
			expect(await orchestrator.flashToken()).to.equal(ZeroAddress);
			expect(await orchestrator.flashAmount()).to.equal(0);

			console.log('✅ State variable getters accessible');
		});
	});

	describe('Error Handling', () => {
		it('Should revert with UnsupportedFunction on fallback', async () => {
			// Try to call a non-existent function
			await expect(
				owner.sendTransaction({
					to: await orchestrator.getAddress(),
					data: '0x12345678', // random function selector
				})
			).to.be.revertedWithCustomError(orchestrator, 'UnsupportedFunction');

			console.log('✅ Fallback function correctly reverts');
		});

		it('Should handle ETH deposits via receive function', async () => {
			// Send ETH to the contract
			await user.sendTransaction({
				to: await orchestrator.getAddress(),
				value: parseEther('0.1'),
			});

			const balance = await ethers.provider.getBalance(await orchestrator.getAddress());
			expect(balance).to.equal(parseEther('0.1'));

			console.log('✅ Contract can receive ETH');
		});
	});
});
