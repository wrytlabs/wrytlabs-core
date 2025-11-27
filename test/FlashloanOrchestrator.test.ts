import { expect } from 'chai';
import { ethers, network } from 'hardhat';
import { formatEther, MaxUint256, parseEther, parseUnits, Signer, ZeroAddress, keccak256, solidityPacked } from 'ethers';
import { FlashloanOrchestrator, FlashloanHook_Savings, IERC20, IMorpho, SavingsVaultZCHF } from '../typechain';
import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import { evm_increaseTime } from './helper';
import { ADDRESS } from '../exports/address.config';

describe('FlashloanOrchestrator with Savings Hook on mainnet fork', function () {
	let orchestrator: FlashloanOrchestrator;
	let savingsHook: FlashloanHook_Savings;
	let morpho: IMorpho;
	let svzchf: SavingsVaultZCHF;
	let zchf: IERC20;

	let owner: SignerWithAddress;
	let user: SignerWithAddress;
	let positionUser: SignerWithAddress;
	let whale: SignerWithAddress;

	// Use addresses from config
	const MORPHO_BLUE = ADDRESS[1].morphoBlue;
	const SAVINGS_VAULT_ZCHF = ADDRESS[1].savingsVaultZCHF;
	const ZCHF_ADDRESS = ADDRESS[1].zchf;
	const MARKET_ID = ADDRESS[1].marketZCHFSVZCHF;
	const WHALE_ADDRESS = '0x9642b23Ed1E01Df1092B92641051881a322F5D4E'; // ZCHF whale

	const flashAmount = parseEther('1000'); // 1000 ZCHF
	const userAmount = parseEther('100'); // 100 ZCHF

	before(async () => {
		// Setup signers
		[owner, user, positionUser] = await ethers.getSigners();

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
			await zchf.connect(whale).transfer(positionUser.address, fundAmount * 2n);

			// Deposit
			await zchf.connect(whale).approve(await morpho.getAddress(), fundAmount * 5n);
			const market = await savingsHook.market();
			await morpho.connect(whale).supply(
				{
					loanToken: market.loanToken,
					collateralToken: market.collateralToken,
					oracle: market.oracle,
					irm: market.irm,
					lltv: market.lltv,
				},
				fundAmount,
				0n,
				whale.address,
				'0x'
			);

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

	describe('Complete Opcode Testing', () => {
		before(async () => {
			// Approve orchestrator
			await zchf.connect(positionUser).approve(await orchestrator.getAddress(), MaxUint256);

			// Set Morpho authorization for the hook to act on behalf of user
			await morpho.connect(positionUser).setAuthorization(await savingsHook.getAddress(), true);

			console.log('👤 Position user funded with', formatEther(await zchf.balanceOf(positionUser.address)), 'ZCHF');
		});

		describe('Opcode 0: INCREASE_LEVERAGE', () => {
			it('Should increase user leverage position', async () => {
				const opcode = 0; // INCREASE_LEVERAGE
				const hookData = ethers.AbiCoder.defaultAbiCoder().encode(['uint8'], [opcode]);

				const userProvides = parseEther('5000'); // User provides 5k ZCHF
				const flashLoanAmount = parseEther('2000'); // Flash 2k ZCHF

				const action = {
					target: await savingsHook.getAddress(),
					value: 0,
					data: hookData,
				};

				// Get initial balances and position
				const initialZCHF = await zchf.balanceOf(positionUser.address);
				const initialPosition = await morpho.position(MARKET_ID, positionUser.address);

				console.log('📈 Increase Leverage Operation:');
				console.log('  User provides:', formatEther(userProvides), 'ZCHF');
				console.log('  Flash loan:', formatEther(flashLoanAmount), 'ZCHF');
				console.log('  Initial collateral:', formatEther(initialPosition.collateral));
				console.log('  Initial borrow:', formatEther(initialPosition.borrowShares));

				// Execute increase leverage
				const tx = await orchestrator
					.connect(positionUser)
					.execute([ZCHF_ADDRESS], [userProvides], ZCHF_ADDRESS, flashLoanAmount, [action]);

				const receipt = await tx.wait();
				console.log('  Gas used:', receipt?.gasUsed.toString());

				// Check results
				const finalZCHF = await zchf.balanceOf(positionUser.address);
				const finalPosition = await morpho.position(MARKET_ID, positionUser.address);

				console.log('  Final collateral:', formatEther(finalPosition.collateral));
				console.log('  Final borrow:', formatEther(finalPosition.borrowShares));
				console.log('  ZCHF change:', formatEther(finalZCHF - initialZCHF));

				// Assertions
				expect(finalPosition.collateral).to.be.gt(initialPosition.collateral); // More collateral
				expect(finalPosition.borrowShares).to.be.gt(initialPosition.borrowShares); // More debt
				expect(finalZCHF).to.be.lt(initialZCHF); // Spent user ZCHF

				console.log('✅ Increase leverage successful');
			});
		});

		describe('Opcode 1: DECREASE_LEVERAGE', () => {
			it('Should decrease user leverage position after time delay', async () => {
				// First, create a position with increase leverage
				const increaseOpcode = 0;
				const increaseData = ethers.AbiCoder.defaultAbiCoder().encode(['uint8'], [increaseOpcode]);

				const setupAction = {
					target: await savingsHook.getAddress(),
					value: 0,
					data: increaseData,
				};

				// Setup position
				await orchestrator
					.connect(positionUser)
					.execute([ZCHF_ADDRESS], [parseEther('5000')], ZCHF_ADDRESS, parseEther('2000'), [setupAction]);

				console.log('📉 Decrease Leverage Operation:');
				console.log('  Waiting 7 days for vault unlock...');

				// Wait 7 days for vault withdrawal to be possible
				await evm_increaseTime(7 * 24 * 60 * 60); // 7 days

				// Get position before decrease
				const beforePosition = await morpho.position(MARKET_ID, positionUser.address);
				const beforeZCHF = await zchf.balanceOf(positionUser.address);

				console.log('  Position before decrease:');
				console.log('    Collateral:', formatEther(beforePosition.collateral));
				console.log('    Borrow:', formatEther(beforePosition.borrowShares));

				// Now decrease leverage
				const decreaseOpcode = 1; // DECREASE_LEVERAGE
				const decreaseData = ethers.AbiCoder.defaultAbiCoder().encode(['uint8'], [decreaseOpcode]);

				const decreaseAction = {
					target: await savingsHook.getAddress(),
					value: 0,
					data: decreaseData,
				};

				// Execute decrease leverage (flash collateral to repay debt)
				const market = await savingsHook.market();
				const tx = await orchestrator.connect(positionUser).execute(
					[], // No user tokens this time
					[],
					market.collateralToken, // Flash svZCHF (collateral)
					parseEther('1000'), // Flash some collateral
					[decreaseAction]
				);

				const receipt = await tx.wait();
				console.log('  Gas used:', receipt?.gasUsed.toString());

				// Check results
				const afterPosition = await morpho.position(MARKET_ID, positionUser.address);
				const afterZCHF = await zchf.balanceOf(positionUser.address);

				console.log('  Position after decrease:');
				console.log('    Collateral:', formatEther(afterPosition.collateral));
				console.log('    Borrow:', formatEther(afterPosition.borrowShares));
				console.log('    ZCHF gained:', formatEther(afterZCHF - beforeZCHF));

				// Assertions
				expect(afterPosition.collateral).to.be.lt(beforePosition.collateral); // Less collateral
				expect(afterPosition.borrowShares).to.be.lt(beforePosition.borrowShares); // Less debt

				console.log('✅ Decrease leverage successful');
			});
		});

		describe('Opcode 2: CLOSE_TO_LOAN', () => {
			it('Should close position and receive loan token', async () => {
				// Setup position first
				const setupOpcode = 0;
				const setupData = ethers.AbiCoder.defaultAbiCoder().encode(['uint8'], [setupOpcode]);

				await orchestrator
					.connect(positionUser)
					.execute([ZCHF_ADDRESS], [parseEther('3000')], ZCHF_ADDRESS, parseEther('1500'), [
						{ target: await savingsHook.getAddress(), value: 0, data: setupData },
					]);

				console.log('🔄 Close to Loan Operation:');
				console.log('  Waiting 7 days for vault unlock...');

				// Wait for vault unlock
				await evm_increaseTime(7 * 24 * 60 * 60);

				const beforePosition = await morpho.position(MARKET_ID, positionUser.address);
				const beforeZCHF = await zchf.balanceOf(positionUser.address);

				console.log('  Position before close:');
				console.log('    Collateral:', formatEther(beforePosition.collateral));
				console.log('    Borrow:', formatEther(beforePosition.borrowShares));

				// Close position to loan token
				const closeOpcode = 2; // CLOSE_TO_LOAN
				const closeData = ethers.AbiCoder.defaultAbiCoder().encode(['uint8'], [closeOpcode]);

				const closeAction = {
					target: await savingsHook.getAddress(),
					value: 0,
					data: closeData,
				};

				// Flash loan token to repay debt
				const tx = await orchestrator.connect(positionUser).execute(
					[],
					[],
					ZCHF_ADDRESS, // Flash ZCHF to repay
					parseEther('20000'), // Flash enough to repay debt
					[closeAction]
				);

				const receipt = await tx.wait();
				console.log('  Gas used:', receipt?.gasUsed.toString());

				// Check results
				const afterPosition = await morpho.position(MARKET_ID, positionUser.address);
				const afterZCHF = await zchf.balanceOf(positionUser.address);

				const market = await savingsHook.market();
				const collateralToken = await ethers.getContractAt('IERC20', market.collateralToken);
				const afterCollateralBal = await collateralToken.balanceOf(positionUser.address);

				console.log('  Position after close:');
				console.log('    Collateral:', formatEther(afterPosition.collateral));
				console.log('    Borrow:', formatEther(afterPosition.borrowShares));
				console.log('    Final ZCHF:', formatEther(afterZCHF));
				console.log('    Final Collateral:', formatEther(afterCollateralBal));

				// Assertions
				expect(afterPosition.collateral).to.equal(0); // No collateral left
				expect(afterPosition.borrowShares).to.equal(0); // No debt left
				expect(afterZCHF).to.be.gt(beforeZCHF); // Received equity in ZCHF

				console.log('✅ Close to loan successful');
			});
		});

		describe('Opcode 3: CLOSE_TO_COLLATERAL', () => {
			it('Should close position and receive collateral token', async () => {
				// Setup position first
				const setupOpcode = 0;
				const setupData = ethers.AbiCoder.defaultAbiCoder().encode(['uint8'], [setupOpcode]);

				await orchestrator
					.connect(positionUser)
					.execute([ZCHF_ADDRESS], [parseEther('3000')], ZCHF_ADDRESS, parseEther('10000'), [
						{ target: await savingsHook.getAddress(), value: 0, data: setupData },
					]);

				console.log('🔄 Close to Collateral Operation:');
				console.log('  Waiting 7 days for vault unlock...');

				// Wait for vault unlock
				await evm_increaseTime(7 * 24 * 60 * 60);

				const market = await savingsHook.market();
				const beforePosition = await morpho.position(MARKET_ID, positionUser.address);
				const collateralToken = await ethers.getContractAt('IERC20', market.collateralToken);
				const beforeCollateralBal = await collateralToken.balanceOf(positionUser.address);

				console.log('  Position before close:');
				console.log('    Collateral:', formatEther(beforePosition.collateral));
				console.log('    Borrow:', formatEther(beforePosition.borrowShares));

				// Close position to collateral token
				const closeOpcode = 3; // CLOSE_TO_COLLATERAL
				const closeData = ethers.AbiCoder.defaultAbiCoder().encode(['uint8'], [closeOpcode]);

				const closeAction = {
					target: await savingsHook.getAddress(),
					value: 0,
					data: closeData,
				};

				// Flash loan token to repay debt
				const tx = await orchestrator.connect(positionUser).execute(
					[],
					[],
					ZCHF_ADDRESS, // Flash ZCHF to repay debt
					parseEther('20000'),
					[closeAction]
				);

				const receipt = await tx.wait();
				console.log('  Gas used:', receipt?.gasUsed.toString());

				// Check results
				const afterPosition = await morpho.position(MARKET_ID, positionUser.address);
				const afterZCHF = await zchf.balanceOf(positionUser.address);
				const afterCollateralBal = await collateralToken.balanceOf(positionUser.address);

				console.log('  Position after close:');
				console.log('    Collateral:', formatEther(afterPosition.collateral));
				console.log('    Borrow:', formatEther(afterPosition.borrowShares));
				console.log('    Collateral token received:', formatEther(afterCollateralBal - beforeCollateralBal));
				console.log('    Final ZCHF:', formatEther(afterZCHF));
				console.log('    Final Collateral:', formatEther(afterCollateralBal));

				// Assertions
				expect(afterPosition.collateral).to.equal(0); // No collateral left
				expect(afterPosition.borrowShares).to.equal(0); // No debt left
				expect(afterCollateralBal).to.be.gt(beforeCollateralBal); // Received collateral tokens

				console.log('✅ Close to collateral successful');
			});
		});

		describe('Edge Cases and Error Conditions', () => {
			it('Should revert with invalid opcode', async () => {
				const invalidOpcode = 99; // Invalid opcode
				const hookData = ethers.AbiCoder.defaultAbiCoder().encode(['uint8'], [invalidOpcode]);

				const action = {
					target: await savingsHook.getAddress(),
					value: 0,
					data: hookData,
				};

				await expect(
					orchestrator
						.connect(positionUser)
						.execute([ZCHF_ADDRESS], [parseEther('100')], ZCHF_ADDRESS, parseEther('50'), [action])
				).to.be.revertedWithCustomError(savingsHook, 'InvalidOpcode');

				console.log('✅ Invalid opcode correctly reverted');
			});

			// it('Should revert when trying to decrease leverage too soon', async () => {
			// 	// Setup position
			// 	const setupOpcode = 0;
			// 	const setupData = ethers.AbiCoder.defaultAbiCoder().encode(['uint8'], [setupOpcode]);

			// 	await orchestrator
			// 		.connect(positionUser)
			// 		.execute([ZCHF_ADDRESS], [parseEther('2000')], ZCHF_ADDRESS, parseEther('1000'), [
			// 			{ target: await savingsHook.getAddress(), value: 0, data: setupData },
			// 		]);

			// 	// Try to decrease immediately (should fail due to vault lock)
			// 	const decreaseOpcode = 1;
			// 	const decreaseData = ethers.AbiCoder.defaultAbiCoder().encode(['uint8'], [decreaseOpcode]);

			// 	const market = await savingsHook.market();
			// 	await expect(
			// 		orchestrator
			// 			.connect(positionUser)
			// 			.execute([], [], market.collateralToken, parseEther('500'), [
			// 				{ target: await savingsHook.getAddress(), value: 0, data: decreaseData },
			// 			])
			// 	).to.be.reverted; // Should revert due to vault withdrawal restrictions

			// 	console.log('✅ Early decrease leverage correctly reverted');
			// });
		});

		describe('Integration Tests', () => {
			it('Should perform complete lifecycle: increase -> decrease -> close', async () => {
				const initialBalance = await zchf.balanceOf(positionUser.address);

				console.log('🔄 Complete Lifecycle Test:');
				console.log('  Starting balance:', formatEther(initialBalance), 'ZCHF');

				// Step 1: Increase leverage
				const increaseData = ethers.AbiCoder.defaultAbiCoder().encode(['uint8'], [0]);
				await orchestrator
					.connect(positionUser)
					.execute([ZCHF_ADDRESS], [parseEther('1000')], ZCHF_ADDRESS, parseEther('3000'), [
						{ target: await savingsHook.getAddress(), value: 0, data: increaseData },
					]);
				console.log('  ✅ Increased leverage');

				// Wait for vault unlock
				console.log('  ⏳ Waiting 7 days...');
				await evm_increaseTime(7 * 24 * 60 * 60);

				// Step 2: Partial decrease
				const decreaseData = ethers.AbiCoder.defaultAbiCoder().encode(['uint8'], [1]);
				const market = await savingsHook.market();
				await orchestrator
					.connect(positionUser)
					.execute([], [], market.collateralToken, parseEther('1000'), [
						{ target: await savingsHook.getAddress(), value: 0, data: decreaseData },
					]);
				console.log('  ✅ Decreased leverage');

				// Step 3: Close position completely
				const closeData = ethers.AbiCoder.defaultAbiCoder().encode(['uint8'], [2]); // CLOSE_TO_LOAN
				await orchestrator
					.connect(positionUser)
					.execute([], [], ZCHF_ADDRESS, parseEther('10000'), [
						{ target: await savingsHook.getAddress(), value: 0, data: closeData },
					]);
				console.log('  ✅ Closed position');

				// Check final state
				const finalPosition = await morpho.position(MARKET_ID, positionUser.address);
				const collateralToken = await ethers.getContractAt('IERC20', market.collateralToken);
				const afterZCHF = await zchf.balanceOf(positionUser.address);
				const afterCollateralBal = await collateralToken.balanceOf(positionUser.address);

				console.log('  Position after close:');
				console.log('    Collateral:', formatEther(finalPosition.collateral));
				console.log('    Borrow:', formatEther(finalPosition.borrowShares));
				console.log('    Final ZCHF:', formatEther(afterZCHF));
				console.log('    Final Collateral:', formatEther(afterCollateralBal));

				expect(finalPosition.collateral).to.equal(0);
				expect(finalPosition.borrowShares).to.equal(0);

				console.log('✅ Complete lifecycle successful');
			});
		});
	});
});
