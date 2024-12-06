import { buildModule } from '@nomicfoundation/hardhat-ignition/modules';
import { storeConstructorArgs } from '../../helper/store.args';
import { args, params } from '../params/BackendWallet';

// params
console.log('Config Info: Deploying Module with accounts');
console.log(params);

// constructor args
storeConstructorArgs('BackendWalletModule', args);
console.log('Constructor Args');
console.log(args);

const BackendWalletModule = buildModule('BackendWalletModule', (m) => {
	// Deploy Membership contract
	const backendWallet = m.contract('BackendWallet', args);

	return {
		backendWallet,
	};
});

export default BackendWalletModule;
