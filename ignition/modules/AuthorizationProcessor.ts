import { buildModule } from '@nomicfoundation/hardhat-ignition/modules';
import { storeConstructorArgs } from '../../helper/store.args';
import { ADDRESS } from '../../exports/address.config';
import { mainnet } from 'viem/chains';

// config and select
export const NAME: string = 'AuthorizationProcessor'; // <-- select smart contract
export const FILE: string = 'AuthorizationProcessor'; // <-- name exported file
export const MOD: string = NAME + 'Module';
console.log(NAME);

// params
export type DeploymentParams = {};

const addr = ADDRESS[mainnet.id];
export const params: DeploymentParams = {};

export type ConstructorArgs = [];

export const args: ConstructorArgs = [];

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
