import { mainnet, polygon } from 'viem/chains';
import { Address, zeroAddress } from 'viem';

export interface ChainAddress {
	backendWallet: Address;
	membershipFactory: Address;
}

export const ADDRESS: Record<number, ChainAddress> = {
	[mainnet.id]: {
		backendWallet: zeroAddress,
		membershipFactory: zeroAddress,
	},
	[polygon.id]: {
		backendWallet: zeroAddress,
		membershipFactory: zeroAddress,
	},
};
