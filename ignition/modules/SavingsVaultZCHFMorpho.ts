import { buildModule } from '@nomicfoundation/hardhat-ignition/modules';
import { storeConstructorArgs } from '../../helper/store.args';
import { ADDRESS } from '../../exports/address.config';
import { Address } from 'viem';
import { mainnet } from 'viem/chains';

// config and select
export const NAME: string = 'SavingsVaultZCHFMorpho'; // <-- select smart contract
export const FILE: string = 'SavingsVaultZCHFMorpho'; // <-- name exported file
export const MOD: string = NAME + 'Module';
console.log(NAME);

// params
export type DeploymentParams = {
	morpho: Address;
	loan: Address;
	collateral: Address;
	oracle: Address;
	irm: Address;
	lltv: bigint;
	owner: Address;
};

const addr = ADDRESS[mainnet.id];
export const params: DeploymentParams = {
	morpho: addr.morphoBlue,
	loan: addr.zchf,
	collateral: addr.savingsVaultZCHF,
	oracle: addr.marketZCHFSVZCHFOracle,
	irm: addr.morphoIrm,
	lltv: BigInt(965000000000000000),
	owner: addr.aragonWrytes,
};

export type ConstructorArgs = [Address, Address, Address, Address, Address, bigint, Address];

export const args: ConstructorArgs = [params.morpho, params.loan, params.collateral, params.oracle, params.irm, params.lltv, params.owner];

console.log('Imported Params:');
console.log(params);

// export args
storeConstructorArgs(FILE, args);
console.log('Constructor Args');
console.log(args);

// fail safe
// process.exit();

export default buildModule(MOD, (m) => {
	return {
		[NAME]: m.contract(NAME, args),
	};
});
