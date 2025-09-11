import { buildModule } from '@nomicfoundation/hardhat-ignition/modules';
import { storeConstructorArgs } from '../../helper/store.args';
import { Address } from 'viem';
import { mainnet } from 'viem/chains';

// config and select
export const NAME: string = 'SavingsVaultZCHF_2'; // <-- select smart contract
export const FILE: string = 'SavingsVaultZCHF_2'; // <-- name exported file
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

export const params: DeploymentParams = {
	owner: '0x0170F42f224b99CcbbeE673093589c5f9691dd06',
	coin: '0xD4dD9e2F021BB459D5A5f6c24C12fE09c5D45553',
	savings: '0xbF594D0feD79AE56d910Cb01b5dD4f4c57B04402',
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
process.exit();

export default buildModule(MOD, (m) => {
	return {
		[NAME]: m.contract(NAME, args),
	};
});
