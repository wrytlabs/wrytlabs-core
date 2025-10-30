import { expect } from 'chai';
import { ethers, network } from 'hardhat';
import { Contract, ContractFactory, Signer, Wallet } from 'ethers';
import { AuthorizationProcessor } from '../typechain/contracts/x402/AuthorizationProcessor';
import { IERC20 } from '../typechain/@openzeppelin/contracts/token/ERC20/IERC20';

// USDC on Ethereum mainnet
const USDC_ADDRESS = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const USDC_WHALE = '0x37305B1cD40574E4C5Ce33f8e8306Be057fD7341'; // Binance 14

describe('AuthorizationProcessor', function () {
	let authProcessor: AuthorizationProcessor;
	let usdc: IERC20;
	let owner: Signer;
	let user1: Signer;
	let signer: Signer;
	let facilitator: Signer;
	let ownerAddress: string;
	let user1Address: string;
	let signerAddress: string;
	let facilitatorAddress: string;

	// Test amounts
	const DEPOSIT_AMOUNT = ethers.parseUnits('1000', 6); // 1000 USDC
	const TRANSFER_AMOUNT = ethers.parseUnits('500', 6); // 500 USDC

	beforeEach(async function () {
		[owner, user1, signer, facilitator] = await ethers.getSigners();
		ownerAddress = await owner.getAddress();
		user1Address = await user1.getAddress();
		signerAddress = await signer.getAddress();
		facilitatorAddress = await facilitator.getAddress();

		// Deploy AuthorizationProcessor
		const AuthProcessor = await ethers.getContractFactory('AuthorizationProcessor');
		authProcessor = (await AuthProcessor.deploy()) as AuthorizationProcessor;

		// Get USDC contract
		usdc = (await ethers.getContractAt('IERC20', USDC_ADDRESS)) as IERC20;

		// Fund test accounts with USDC from whale
		await network.provider.request({
			method: 'hardhat_impersonateAccount',
			params: [USDC_WHALE],
		});

		const whale = await ethers.getSigner(USDC_WHALE);

		// Fund whale with ETH for gas fees
		await owner.sendTransaction({
			to: USDC_WHALE,
			value: ethers.parseEther('1.0'),
		});

		// Check whale balance
		const whaleBalance = await usdc.balanceOf(USDC_WHALE);
		const requiredAmount = DEPOSIT_AMOUNT * 30n; // 10x for each of 3 accounts

		if (whaleBalance < requiredAmount) {
			throw new Error(
				`Whale account doesn't have enough USDC. Has: ${ethers.formatUnits(whaleBalance, 6)}, Needs: ${ethers.formatUnits(
					requiredAmount,
					6
				)}`
			);
		}

		// Transfer USDC to test accounts
		await usdc.connect(whale).transfer(ownerAddress, DEPOSIT_AMOUNT * 10n);
		await usdc.connect(whale).transfer(user1Address, DEPOSIT_AMOUNT * 10n);
		await usdc.connect(whale).transfer(signerAddress, DEPOSIT_AMOUNT * 10n);

		await network.provider.request({
			method: 'hardhat_stopImpersonatingAccount',
			params: [USDC_WHALE],
		});
	});

	describe('Authorization Management', function () {
		it('should authorize a signer with allowances', async function () {
			const allowance = {
				deposit: DEPOSIT_AMOUNT,
				transfer: TRANSFER_AMOUNT,
				process: TRANSFER_AMOUNT,
				claim: TRANSFER_AMOUNT,
			};

			await expect(authProcessor.connect(owner).authorize(signerAddress, USDC_ADDRESS, allowance))
				.to.emit(authProcessor, 'Authorized')
				.withArgs(ownerAddress, signerAddress, USDC_ADDRESS, Object.values(allowance));

			// Verify allowances are set correctly
			const auth = await authProcessor.authorized(ownerAddress, signerAddress, USDC_ADDRESS);
			expect(auth.deposit).to.equal(DEPOSIT_AMOUNT);
			expect(auth.transfer).to.equal(TRANSFER_AMOUNT);
			expect(auth.process).to.equal(TRANSFER_AMOUNT);
			expect(auth.claim).to.equal(TRANSFER_AMOUNT);
		});

		it('should authorize using authorizeAuth function', async function () {
			const auth = {
				kind: 1, // DEPOSIT
				from: ownerAddress,
				to: user1Address,
				token: USDC_ADDRESS,
				amount: DEPOSIT_AMOUNT,
				nonce: ethers.randomBytes(32),
				validAfter: (await ethers.provider.getBlock('latest'))!.timestamp,
				validBefore: (await ethers.provider.getBlock('latest'))!.timestamp + 3600,
				signature: '0x',
			};

			await authProcessor.connect(owner).authorizeAuth(auth, signerAddress);

			const allowance = await authProcessor.authorized(ownerAddress, signerAddress, USDC_ADDRESS);
			expect(allowance.deposit).to.equal(DEPOSIT_AMOUNT);
		});
	});

	describe('EIP-712 Signature Verification', function () {
		let domain: any;
		let types: any;

		beforeEach(async function () {
			// Set up EIP-712 domain
			domain = {
				name: 'AuthorizationProcessor',
				version: '1',
				chainId: await network.provider.send('eth_chainId'),
				verifyingContract: await authProcessor.getAddress(),
			};

			types = {
				Authorization: [
					{ name: 'kind', type: 'uint8' },
					{ name: 'from', type: 'address' },
					{ name: 'to', type: 'address' },
					{ name: 'token', type: 'address' },
					{ name: 'amount', type: 'uint256' },
					{ name: 'nonce', type: 'bytes32' },
					{ name: 'validAfter', type: 'uint256' },
					{ name: 'validBefore', type: 'uint256' },
				],
			};
		});

		it('should verify valid EIP-712 signatures', async function () {
			const nonce = ethers.randomBytes(32);
			const validAfter = (await ethers.provider.getBlock('latest'))!.timestamp;
			const validBefore = validAfter + 3600;

			const authorization = {
				kind: 1, // DEPOSIT
				from: ownerAddress,
				to: user1Address,
				token: USDC_ADDRESS,
				amount: DEPOSIT_AMOUNT,
				nonce,
				validAfter,
				validBefore,
			};

			// Sign with signer private key
			const signature = await signer.signTypedData(domain, types, authorization);

			const authWithSig = {
				...authorization,
				signature,
			};

			// Verify signature returns correct signer
			const recoveredSigner = await authProcessor.verifySignature(authWithSig);
			expect(recoveredSigner).to.equal(signerAddress);
		});

		it('should reject invalid signatures', async function () {
			const nonce = ethers.randomBytes(32);
			const validAfter = (await ethers.provider.getBlock('latest'))!.timestamp;
			const validBefore = validAfter + 3600;

			const authorization = {
				kind: 1, // DEPOSIT
				from: ownerAddress,
				to: user1Address,
				token: USDC_ADDRESS,
				amount: DEPOSIT_AMOUNT,
				nonce,
				validAfter,
				validBefore,
			};

			// Sign with wrong private key (signer instead of user1)
			const signature = await signer.signTypedData(domain, types, authorization);

			const authWithSig = {
				...authorization,
				signature,
			};

			// Should return signer address (who actually signed)
			const recoveredSigner = await authProcessor.verifySignature(authWithSig);
			expect(recoveredSigner).to.equal(signerAddress);
			expect(recoveredSigner).to.not.equal(user1Address);
		});
	});

	describe('TRANSFER Operations', function () {
		let domain: any;
		let types: any;

		beforeEach(async function () {
			// Set up EIP-712 domain
			domain = {
				name: 'AuthorizationProcessor',
				version: '1',
				chainId: await network.provider.send('eth_chainId'),
				verifyingContract: await authProcessor.getAddress(),
			};

			types = {
				Authorization: [
					{ name: 'kind', type: 'uint8' },
					{ name: 'from', type: 'address' },
					{ name: 'to', type: 'address' },
					{ name: 'token', type: 'address' },
					{ name: 'amount', type: 'uint256' },
					{ name: 'nonce', type: 'bytes32' },
					{ name: 'validAfter', type: 'uint256' },
					{ name: 'validBefore', type: 'uint256' },
				],
			};

			// First deposit some funds
			await usdc.connect(owner).approve(await authProcessor.getAddress(), DEPOSIT_AMOUNT);

			// Authorize facilitator for transfers
			const allowance = {
				deposit: DEPOSIT_AMOUNT,
				transfer: TRANSFER_AMOUNT * 2n,
				process: TRANSFER_AMOUNT * 2n,
				claim: TRANSFER_AMOUNT * 2n,
			};
			await authProcessor.connect(owner).authorize(signerAddress, USDC_ADDRESS, allowance);
		});

		it('should execute transfer with authorization', async function () {
			const nonce = ethers.randomBytes(32);
			const validAfter = (await ethers.provider.getBlock('latest'))!.timestamp;
			const validBefore = validAfter + 3600;

			const authorization = {
				kind: 0, // TRANSFER
				from: ownerAddress,
				to: user1Address,
				token: USDC_ADDRESS,
				amount: TRANSFER_AMOUNT,
				nonce,
				validAfter,
				validBefore,
			};

			const signature = await signer.signTypedData(domain, types, authorization);
			const authWithSig = { ...authorization, signature };

			const initialExternalBalanceOwner = await usdc.balanceOf(ownerAddress);
			const initialExternalBalanceUser1 = await usdc.balanceOf(user1Address);

			await expect(authProcessor.connect(facilitator).executeWithAuthorization(authWithSig))
				.to.emit(authProcessor, 'Transfer')
				.withArgs(ownerAddress, user1Address, USDC_ADDRESS, TRANSFER_AMOUNT, signerAddress);

			// Check external balances (TRANSFER doesn't use internal balances)
			const finalExternalBalanceOwner = await usdc.balanceOf(ownerAddress);
			const finalExternalBalanceUser1 = await usdc.balanceOf(user1Address);

			expect(initialExternalBalanceOwner - finalExternalBalanceOwner).to.equal(TRANSFER_AMOUNT);
			expect(finalExternalBalanceUser1 - initialExternalBalanceUser1).to.equal(TRANSFER_AMOUNT);
		});
	});

	describe('DEPOSIT Operations', function () {
		let domain: any;
		let types: any;

		beforeEach(async function () {
			domain = {
				name: 'AuthorizationProcessor',
				version: '1',
				chainId: await network.provider.send('eth_chainId'),
				verifyingContract: await authProcessor.getAddress(),
			};

			types = {
				Authorization: [
					{ name: 'kind', type: 'uint8' },
					{ name: 'from', type: 'address' },
					{ name: 'to', type: 'address' },
					{ name: 'token', type: 'address' },
					{ name: 'amount', type: 'uint256' },
					{ name: 'nonce', type: 'bytes32' },
					{ name: 'validAfter', type: 'uint256' },
					{ name: 'validBefore', type: 'uint256' },
				],
			};

			// Authorize signer
			const allowance = {
				deposit: DEPOSIT_AMOUNT * 2n,
				transfer: TRANSFER_AMOUNT * 2n,
				process: TRANSFER_AMOUNT * 2n,
				claim: TRANSFER_AMOUNT * 2n,
			};
			await authProcessor.connect(owner).authorize(signerAddress, USDC_ADDRESS, allowance);
		});

		it('should execute deposit with authorization', async function () {
			const nonce = ethers.randomBytes(32);
			const validAfter = (await ethers.provider.getBlock('latest'))!.timestamp;
			const validBefore = validAfter + 3600;

			const authorization = {
				kind: 1, // DEPOSIT
				from: ownerAddress,
				to: user1Address,
				token: USDC_ADDRESS,
				amount: DEPOSIT_AMOUNT,
				nonce,
				validAfter,
				validBefore,
			};

			const signature = await signer.signTypedData(domain, types, authorization);
			const authWithSig = { ...authorization, signature };

			// Approve USDC transfer
			await usdc.connect(owner).approve(await authProcessor.getAddress(), DEPOSIT_AMOUNT);

			const initialBalance = await authProcessor.balanceOf(user1Address, USDC_ADDRESS);

			await expect(authProcessor.connect(facilitator).executeWithAuthorization(authWithSig))
				.to.emit(authProcessor, 'Deposit')
				.withArgs(ownerAddress, user1Address, USDC_ADDRESS, DEPOSIT_AMOUNT, signerAddress);

			// Check internal balance increased
			const finalBalance = await authProcessor.balanceOf(user1Address, USDC_ADDRESS);
			expect(finalBalance - initialBalance).to.equal(DEPOSIT_AMOUNT);

			// Check allowance was decreased
			const allowance = await authProcessor.authorized(ownerAddress, signerAddress, USDC_ADDRESS);
			expect(allowance.deposit).to.equal(DEPOSIT_AMOUNT); // 2 * DEPOSIT_AMOUNT - DEPOSIT_AMOUNT
		});

		it('should allow self-deposit without allowance', async function () {
			const nonce = ethers.randomBytes(32);
			const validAfter = (await ethers.provider.getBlock('latest'))!.timestamp;
			const validBefore = validAfter + 3600;

			const authorization = {
				kind: 1, // DEPOSIT
				from: ownerAddress,
				to: user1Address,
				token: USDC_ADDRESS,
				amount: DEPOSIT_AMOUNT,
				nonce,
				validAfter,
				validBefore,
			};

			// owner signs their own transaction
			const signature = await owner.signTypedData(domain, types, authorization);
			const authWithSig = { ...authorization, signature };

			await usdc.connect(owner).approve(await authProcessor.getAddress(), DEPOSIT_AMOUNT);

			await expect(authProcessor.connect(facilitator).executeWithAuthorization(authWithSig))
				.to.emit(authProcessor, 'Deposit')
				.withArgs(ownerAddress, user1Address, USDC_ADDRESS, DEPOSIT_AMOUNT, ownerAddress);
		});
	});

	describe('PROCESS Operations', function () {
		let domain: any;
		let types: any;

		beforeEach(async function () {
			domain = {
				name: 'AuthorizationProcessor',
				version: '1',
				chainId: await network.provider.send('eth_chainId'),
				verifyingContract: await authProcessor.getAddress(),
			};

			types = {
				Authorization: [
					{ name: 'kind', type: 'uint8' },
					{ name: 'from', type: 'address' },
					{ name: 'to', type: 'address' },
					{ name: 'token', type: 'address' },
					{ name: 'amount', type: 'uint256' },
					{ name: 'nonce', type: 'bytes32' },
					{ name: 'validAfter', type: 'uint256' },
					{ name: 'validBefore', type: 'uint256' },
				],
			};

			// Deposit funds for user1
			await usdc.connect(owner).approve(await authProcessor.getAddress(), DEPOSIT_AMOUNT);

			const depositAuth = {
				kind: 1, // DEPOSIT
				from: ownerAddress,
				to: ownerAddress,
				token: USDC_ADDRESS,
				amount: DEPOSIT_AMOUNT,
				nonce: ethers.randomBytes(32),
				validAfter: (await ethers.provider.getBlock('latest'))!.timestamp,
				validBefore: (await ethers.provider.getBlock('latest'))!.timestamp + 3600,
			};

			const depositSig = await owner.signTypedData(domain, types, depositAuth);
			await authProcessor.connect(facilitator).executeWithAuthorization({ ...depositAuth, signature: depositSig });

			// Authorize signer
			const allowance = {
				deposit: DEPOSIT_AMOUNT * 2n,
				transfer: TRANSFER_AMOUNT * 2n,
				process: TRANSFER_AMOUNT * 2n,
				claim: TRANSFER_AMOUNT * 2n,
			};
			await authProcessor.connect(owner).authorize(signerAddress, USDC_ADDRESS, allowance);
		});

		it('should execute internal process operation', async function () {
			const nonce = ethers.randomBytes(32);
			const validAfter = (await ethers.provider.getBlock('latest'))!.timestamp;
			const validBefore = validAfter + 3600;

			const authorization = {
				kind: 2, // PROCESS
				from: ownerAddress,
				to: user1Address,
				token: USDC_ADDRESS,
				amount: TRANSFER_AMOUNT,
				nonce,
				validAfter,
				validBefore,
			};

			const signature = await signer.signTypedData(domain, types, authorization);
			const authWithSig = { ...authorization, signature };

			const initialFromBalance = await authProcessor.balanceOf(ownerAddress, USDC_ADDRESS);
			const initialToBalance = await authProcessor.balanceOf(user1Address, USDC_ADDRESS);

			await expect(authProcessor.connect(facilitator).executeWithAuthorization(authWithSig))
				.to.emit(authProcessor, 'Process')
				.withArgs(ownerAddress, user1Address, USDC_ADDRESS, TRANSFER_AMOUNT, signerAddress);

			// Check internal balances updated
			const finalFromBalance = await authProcessor.balanceOf(ownerAddress, USDC_ADDRESS);
			const finalToBalance = await authProcessor.balanceOf(user1Address, USDC_ADDRESS);

			expect(initialFromBalance - finalFromBalance).to.equal(TRANSFER_AMOUNT);
			expect(finalToBalance - initialToBalance).to.equal(TRANSFER_AMOUNT);
		});
	});

	describe('CLAIM Operations', function () {
		let domain: any;
		let types: any;

		beforeEach(async function () {
			domain = {
				name: 'AuthorizationProcessor',
				version: '1',
				chainId: await network.provider.send('eth_chainId'),
				verifyingContract: await authProcessor.getAddress(),
			};

			types = {
				Authorization: [
					{ name: 'kind', type: 'uint8' },
					{ name: 'from', type: 'address' },
					{ name: 'to', type: 'address' },
					{ name: 'token', type: 'address' },
					{ name: 'amount', type: 'uint256' },
					{ name: 'nonce', type: 'bytes32' },
					{ name: 'validAfter', type: 'uint256' },
					{ name: 'validBefore', type: 'uint256' },
				],
			};

			// Deposit funds for user1
			await usdc.connect(owner).approve(await authProcessor.getAddress(), DEPOSIT_AMOUNT);

			const depositAuth = {
				kind: 1, // DEPOSIT
				from: user1Address,
				to: user1Address,
				token: USDC_ADDRESS,
				amount: DEPOSIT_AMOUNT,
				nonce: ethers.randomBytes(32),
				validAfter: (await ethers.provider.getBlock('latest'))!.timestamp,
				validBefore: (await ethers.provider.getBlock('latest'))!.timestamp + 3600,
			};

			const depositSig = await signer.signTypedData(domain, types, depositAuth);
			await authProcessor.connect(facilitator).executeWithAuthorization({ ...depositAuth, signature: depositSig });

			// Authorize facilitator for claims
			const allowance = {
				deposit: DEPOSIT_AMOUNT,
				transfer: TRANSFER_AMOUNT,
				process: TRANSFER_AMOUNT,
				claim: TRANSFER_AMOUNT * 2n,
			};
			await authProcessor.connect(owner).authorize(signerAddress, USDC_ADDRESS, allowance);
		});

		it('should execute claim with authorization', async function () {
			const nonce = ethers.randomBytes(32);
			const validAfter = (await ethers.provider.getBlock('latest'))!.timestamp;
			const validBefore = validAfter + 3600;

			const authorization = {
				kind: 3, // CLAIM
				from: ownerAddress,
				to: user1Address,
				token: USDC_ADDRESS,
				amount: TRANSFER_AMOUNT,
				nonce,
				validAfter,
				validBefore,
			};

			const signature = await facilitator.signTypedData(domain, types, authorization);
			const authWithSig = { ...authorization, signature };

			const initialInternalBalance = await authProcessor.balanceOf(ownerAddress, USDC_ADDRESS);
			const initialExternalBalance = await usdc.balanceOf(ownerAddress);

			await expect(authProcessor.connect(facilitator).executeWithAuthorization(authWithSig))
				.to.emit(authProcessor, 'Claim')
				.withArgs(ownerAddress, user1Address, USDC_ADDRESS, TRANSFER_AMOUNT, signerAddress);

			// Check internal balance decreased
			const finalInternalBalance = await authProcessor.balanceOf(ownerAddress, USDC_ADDRESS);
			expect(initialInternalBalance - finalInternalBalance).to.equal(TRANSFER_AMOUNT);

			// Check external balance increased
			const finalExternalBalance = await usdc.balanceOf(ownerAddress);
			expect(finalExternalBalance - initialExternalBalance).to.equal(TRANSFER_AMOUNT);

			// Check allowance was decreased
			const allowance = await authProcessor.authorized(ownerAddress, signerAddress, USDC_ADDRESS);
			expect(allowance.claim).to.equal(TRANSFER_AMOUNT); // 2 * TRANSFER_AMOUNT - TRANSFER_AMOUNT
		});

		it('should allow self-claim without allowance', async function () {
			const nonce = ethers.randomBytes(32);
			const validAfter = (await ethers.provider.getBlock('latest'))!.timestamp;
			const validBefore = validAfter + 3600;

			const authorization = {
				kind: 3, // CLAIM
				from: ownerAddress,
				to: user1Address,
				token: USDC_ADDRESS,
				amount: TRANSFER_AMOUNT,
				nonce,
				validAfter,
				validBefore,
			};

			// User1 signs their own transaction
			const signature = await signer.signTypedData(domain, types, authorization);
			const authWithSig = { ...authorization, signature };

			const initialInternalBalance = await authProcessor.balanceOf(ownerAddress, USDC_ADDRESS);
			const initialExternalBalance = await usdc.balanceOf(ownerAddress);

			await expect(authProcessor.connect(facilitator).executeWithAuthorization(authWithSig))
				.to.emit(authProcessor, 'Claim')
				.withArgs(ownerAddress, user1Address, USDC_ADDRESS, TRANSFER_AMOUNT, user1Address);

			// Check internal balance decreased
			const finalInternalBalance = await authProcessor.balanceOf(ownerAddress, USDC_ADDRESS);
			expect(initialInternalBalance - finalInternalBalance).to.equal(TRANSFER_AMOUNT);

			// Check external balance increased
			const finalExternalBalance = await usdc.balanceOf(ownerAddress);
			expect(finalExternalBalance - initialExternalBalance).to.equal(TRANSFER_AMOUNT);
		});

		it('should reject claim with insufficient internal balance', async function () {
			const nonce = ethers.randomBytes(32);
			const validAfter = (await ethers.provider.getBlock('latest'))!.timestamp;
			const validBefore = validAfter + 3600;

			const authorization = {
				kind: 3, // CLAIM
				from: ownerAddress,
				to: user1Address,
				token: USDC_ADDRESS,
				amount: DEPOSIT_AMOUNT * 2n, // More than available
				nonce,
				validAfter,
				validBefore,
			};

			const signature = await signer.signTypedData(domain, types, authorization);
			const authWithSig = { ...authorization, signature };

			await expect(authProcessor.connect(facilitator).executeWithAuthorization(authWithSig))
				.to.be.revertedWithCustomError(authProcessor, 'InsufficientBalance')
				.withArgs(ownerAddress, USDC_ADDRESS, DEPOSIT_AMOUNT, DEPOSIT_AMOUNT * 2n);
		});
	});

	describe('Batch Operations', function () {
		let domain: any;
		let types: any;

		beforeEach(async function () {
			domain = {
				name: 'AuthorizationProcessor',
				version: '1',
				chainId: await network.provider.send('eth_chainId'),
				verifyingContract: await authProcessor.getAddress(),
			};

			types = {
				Authorization: [
					{ name: 'kind', type: 'uint8' },
					{ name: 'from', type: 'address' },
					{ name: 'to', type: 'address' },
					{ name: 'token', type: 'address' },
					{ name: 'amount', type: 'uint256' },
					{ name: 'nonce', type: 'bytes32' },
					{ name: 'validAfter', type: 'uint256' },
					{ name: 'validBefore', type: 'uint256' },
				],
			};

			// Approve USDC transfers
			await usdc.connect(owner).approve(await authProcessor.getAddress(), DEPOSIT_AMOUNT * 3n);
		});

		it('should execute batch operations', async function () {
			const validAfter = (await ethers.provider.getBlock('latest'))!.timestamp;
			const validBefore = validAfter + 3600;

			const auths = [
				{
					kind: 1, // DEPOSIT
					from: user1Address,
					to: user1Address,
					token: USDC_ADDRESS,
					amount: DEPOSIT_AMOUNT,
					nonce: ethers.randomBytes(32),
					validAfter,
					validBefore,
				},
				{
					kind: 2, // PROCESS
					from: user1Address,
					to: signerAddress,
					token: USDC_ADDRESS,
					amount: TRANSFER_AMOUNT,
					nonce: ethers.randomBytes(32),
					validAfter,
					validBefore,
				},
			];

			const authsWithSigs = await Promise.all(
				auths.map(async (auth) => ({
					...auth,
					signature: await signer.signTypedData(domain, types, auth),
				}))
			);

			const initialUser2Balance = await authProcessor.balanceOf(user1Address, USDC_ADDRESS);

			await expect(authProcessor.connect(user1).batchExecute(authsWithSigs))
				.to.emit(authProcessor, 'Deposit')
				.and.to.emit(authProcessor, 'Process');

			// Check final state
			const finalUser1Balance = await authProcessor.balanceOf(ownerAddress, USDC_ADDRESS);
			const finalUser2Balance = await authProcessor.balanceOf(user1Address, USDC_ADDRESS);

			expect(finalUser1Balance).to.equal(DEPOSIT_AMOUNT - TRANSFER_AMOUNT);
			expect(finalUser2Balance - initialUser2Balance).to.equal(TRANSFER_AMOUNT);
		});
	});

	describe('Error Cases', function () {
		let domain: any;
		let types: any;

		beforeEach(async function () {
			domain = {
				name: 'AuthorizationProcessor',
				version: '1',
				chainId: await network.provider.send('eth_chainId'),
				verifyingContract: await authProcessor.getAddress(),
			};

			types = {
				Authorization: [
					{ name: 'kind', type: 'uint8' },
					{ name: 'from', type: 'address' },
					{ name: 'to', type: 'address' },
					{ name: 'token', type: 'address' },
					{ name: 'amount', type: 'uint256' },
					{ name: 'nonce', type: 'bytes32' },
					{ name: 'validAfter', type: 'uint256' },
					{ name: 'validBefore', type: 'uint256' },
				],
			};
		});

		it('should reject expired authorizations', async function () {
			const nonce = ethers.randomBytes(32);
			const currentTime = (await ethers.provider.getBlock('latest'))!.timestamp;
			const validAfter = currentTime - 3600; // 1 hour ago
			const validBefore = currentTime - 1800; // 30 minutes ago (expired)

			const authorization = {
				kind: 1, // DEPOSIT
				from: ownerAddress,
				to: user1Address,
				token: USDC_ADDRESS,
				amount: DEPOSIT_AMOUNT,
				nonce,
				validAfter,
				validBefore,
			};

			const signature = await signer.signTypedData(domain, types, authorization);
			const authWithSig = { ...authorization, signature };

			await expect(authProcessor.connect(facilitator).executeWithAuthorization(authWithSig)).to.be.revertedWithCustomError(
				authProcessor,
				'AuthorizationExpired'
			);
		});

		it('should reject future authorizations', async function () {
			const nonce = ethers.randomBytes(32);
			const currentTime = (await ethers.provider.getBlock('latest'))!.timestamp;
			const validAfter = currentTime + 3600; // 1 hour in the future
			const validBefore = currentTime + 7200; // 2 hours in the future

			const authorization = {
				kind: 1, // DEPOSIT
				from: ownerAddress,
				to: user1Address,
				token: USDC_ADDRESS,
				amount: DEPOSIT_AMOUNT,
				nonce,
				validAfter,
				validBefore,
			};

			const signature = await signer.signTypedData(domain, types, authorization);
			const authWithSig = { ...authorization, signature };

			await expect(authProcessor.connect(facilitator).executeWithAuthorization(authWithSig)).to.be.revertedWithCustomError(
				authProcessor,
				'AuthorizationNotYetValid'
			);
		});

		it('should reject reused nonces', async function () {
			const nonce = ethers.randomBytes(32);
			const validAfter = (await ethers.provider.getBlock('latest'))!.timestamp;
			const validBefore = validAfter + 3600;

			const authorization = {
				kind: 1, // DEPOSIT
				from: ownerAddress,
				to: user1Address,
				token: USDC_ADDRESS,
				amount: DEPOSIT_AMOUNT,
				nonce,
				validAfter,
				validBefore,
			};

			const signature = await signer.signTypedData(domain, types, authorization);
			const authWithSig = { ...authorization, signature };

			await usdc.connect(owner).approve(await authProcessor.getAddress(), DEPOSIT_AMOUNT * 2n);

			// First execution should succeed
			await authProcessor.connect(facilitator).executeWithAuthorization(authWithSig);

			// Second execution with same nonce should fail
			await expect(authProcessor.connect(facilitator).executeWithAuthorization(authWithSig)).to.be.revertedWithCustomError(
				authProcessor,
				'NonceAlreadyUsed'
			);
		});

		it('should reject insufficient allowance', async function () {
			// Don't authorize facilitator
			const nonce = ethers.randomBytes(32);
			const validAfter = (await ethers.provider.getBlock('latest'))!.timestamp;
			const validBefore = validAfter + 3600;

			const authorization = {
				kind: 1, // DEPOSIT
				from: ownerAddress,
				to: user1Address,
				token: USDC_ADDRESS,
				amount: DEPOSIT_AMOUNT,
				nonce,
				validAfter,
				validBefore,
			};

			const signature = await facilitator.signTypedData(domain, types, authorization);
			const authWithSig = { ...authorization, signature };

			await expect(authProcessor.connect(facilitator).executeWithAuthorization(authWithSig)).to.be.revertedWithCustomError(
				authProcessor,
				'NotAuthorized'
			);
		});

		it('should reject insufficient balance for PROCESS operation', async function () {
			const nonce = ethers.randomBytes(32);
			const validAfter = (await ethers.provider.getBlock('latest'))!.timestamp;
			const validBefore = validAfter + 3600;

			const authorization = {
				kind: 2, // PROCESS
				from: ownerAddress,
				to: user1Address,
				token: USDC_ADDRESS,
				amount: DEPOSIT_AMOUNT * 10n, // More than available
				nonce,
				validAfter,
				validBefore,
			};

			const signature = await signer.signTypedData(domain, types, authorization);
			const authWithSig = { ...authorization, signature };

			await expect(authProcessor.connect(facilitator).executeWithAuthorization(authWithSig))
				.to.be.revertedWithCustomError(authProcessor, 'InsufficientBalance')
				.withArgs(ownerAddress, USDC_ADDRESS, 0, DEPOSIT_AMOUNT * 10n);
		});

		it('should handle invalid signature (zero address recovery)', async function () {
			const nonce = ethers.randomBytes(32);
			const validAfter = (await ethers.provider.getBlock('latest'))!.timestamp;
			const validBefore = validAfter + 3600;

			const authorization = {
				kind: 1, // DEPOSIT
				from: ownerAddress,
				to: user1Address,
				token: USDC_ADDRESS,
				amount: DEPOSIT_AMOUNT,
				nonce,
				validAfter,
				validBefore,
				signature:
					'0x0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000', // Invalid signature (all zeros)
			};

			await expect(authProcessor.connect(facilitator).executeWithAuthorization(authorization)).to.be.reverted;
		});

		it('should emit AllowanceUsed and NonceUsed events', async function () {
			// Setup authorization for facilitator
			const allowance = {
				deposit: DEPOSIT_AMOUNT,
				transfer: TRANSFER_AMOUNT,
				process: TRANSFER_AMOUNT,
				claim: TRANSFER_AMOUNT,
			};
			await authProcessor.connect(owner).authorize(signerAddress, USDC_ADDRESS, allowance);

			const nonce = ethers.randomBytes(32);
			const validAfter = (await ethers.provider.getBlock('latest'))!.timestamp;
			const validBefore = validAfter + 3600;

			const authorization = {
				kind: 1, // DEPOSIT
				from: ownerAddress,
				to: user1Address,
				token: USDC_ADDRESS,
				amount: DEPOSIT_AMOUNT,
				nonce,
				validAfter,
				validBefore,
			};

			const signature = await facilitator.signTypedData(domain, types, authorization);
			const authWithSig = { ...authorization, signature };

			await usdc.connect(owner).approve(await authProcessor.getAddress(), DEPOSIT_AMOUNT);

			await expect(authProcessor.connect(facilitator).executeWithAuthorization(authWithSig))
				.to.emit(authProcessor, 'AllowanceUsed')
				.withArgs(ownerAddress, user1Address, USDC_ADDRESS, 1, DEPOSIT_AMOUNT) // 1 = DEPOSIT
				.to.emit(authProcessor, 'NonceUsed')
				.withArgs(signerAddress, nonce);
		});

		it('should verify authorization timing constraints', async function () {
			const nonce = ethers.randomBytes(32);
			const currentTime = (await ethers.provider.getBlock('latest'))!.timestamp;

			const authorization = {
				kind: 1, // DEPOSIT
				from: ownerAddress,
				to: user1Address,
				token: USDC_ADDRESS,
				amount: DEPOSIT_AMOUNT,
				nonce,
				validAfter: currentTime,
				validBefore: currentTime + 3600, // Longer window to ensure it doesn't expire
			};

			const signature = await signer.signTypedData(domain, types, authorization);
			const authWithSig = { ...authorization, signature };

			// Should work within time window
			await usdc.connect(owner).approve(await authProcessor.getAddress(), DEPOSIT_AMOUNT);

			const initialBalance = await authProcessor.balanceOf(user1Address, USDC_ADDRESS);

			await expect(authProcessor.connect(facilitator).executeWithAuthorization(authWithSig))
				.to.emit(authProcessor, 'Deposit')
				.withArgs(ownerAddress, user1Address, USDC_ADDRESS, DEPOSIT_AMOUNT, user1Address);

			// Verify the deposit worked
			const finalBalance = await authProcessor.balanceOf(user1Address, USDC_ADDRESS);
			expect(finalBalance - initialBalance).to.equal(DEPOSIT_AMOUNT);
		});
	});
});
