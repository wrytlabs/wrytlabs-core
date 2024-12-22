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
		backendWallet: '0xAbc09B2e5729a0B16143811646e390eeC7036554',
		membershipFactory: '0xf36A13a48f1Fa4932521Ab0309eF8191E5F4D9EA',
	},
};

export const START = {
	[mainnet.id]: {
		membership: 0,
	},
	[polygon.id]: {
		membership: 65794269,
	},
};
