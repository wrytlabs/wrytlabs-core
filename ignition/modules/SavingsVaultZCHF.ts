import { buildModule } from '@nomicfoundation/hardhat-ignition/modules';
import { storeConstructorArgs } from '../../helper/store.args';
import { ADDRESS } from '../../exports/address.config';
import { Address } from 'viem';
import { mainnet } from 'viem/chains';

// config and select
export const NAME: string = 'SavingsVaultZCHF'; // <-- select smart contract
export const FILE: string = 'SavingsVaultZCHF'; // <-- name exported file
export const MOD: string = NAME + 'Module';
console.log(NAME);

// params
export type DeploymentParams = {
	owner: Address;
	coin: Address;
	savings: Address;
	name: string;
	symbol: string;
};

const addr = ADDRESS[mainnet.id];
export const params: DeploymentParams = {
	owner: addr.aragonWrytes,
	coin: addr.zchf,
	savings: addr.frankencoinSavings,
	name: 'SavingsVault ZCHF',
	symbol: 'svZCHF',
};

export type ConstructorArgs = [Address, Address, Address, string, string];

export const args: ConstructorArgs = [params.owner, params.coin, params.savings, params.name, params.symbol];

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
