import { expect } from 'chai';
import { ethers } from 'hardhat';
import { Membership } from '../typechain';
import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';

describe('Membership', function () {
	let membership: Membership;
	let admin: SignerWithAddress;
	let executor: SignerWithAddress;
	let member: SignerWithAddress;
	let nonMember: SignerWithAddress;

	let roleAdmin: string;
	let roleExecutor: string;
	let roleMember: string;

	beforeEach(async function () {
		[admin, executor, member, nonMember] = await ethers.getSigners();

		const Membership = await ethers.getContractFactory('Membership');
		membership = await Membership.deploy(admin.address, executor.address, member.address);

		roleAdmin = await membership.ADMIN_ROLE();
		roleExecutor = await membership.EXECUTOR_ROLE();
		roleMember = await membership.MEMBER_ROLE();
	});

	describe('Role Checks', function () {
		it('Should correctly assign admin role', async function () {
			expect(await membership.hasRole(roleAdmin, admin.address)).to.equal(true); // Admin level
			expect(await membership.hasRole(roleAdmin, executor.address)).to.equal(false); // Not admin
		});

		it('Should correctly assign executor role', async function () {
			expect(await membership.hasRole(roleExecutor, executor.address)).to.equal(true); // Executor level
			expect(await membership.hasRole(roleExecutor, admin.address)).to.equal(true); // Admin includes executor
			expect(await membership.hasRole(roleExecutor, member.address)).to.equal(false); // Not executor
		});

		it('Should correctly assign member role', async function () {
			expect(await membership.hasRole(roleMember, member.address)).to.equal(true); // Member level
			expect(await membership.hasRole(roleMember, executor.address)).to.equal(true); // Executor includes member
			expect(await membership.hasRole(roleMember, admin.address)).to.equal(true); // Admin includes member
			expect(await membership.hasRole(roleMember, nonMember.address)).to.equal(false); // No role
		});
	});
});
