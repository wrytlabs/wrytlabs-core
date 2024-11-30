import { mainnet, polygon } from 'viem/chains';
import { Address, Chain, zeroAddress } from 'viem';

export interface ChainAddress {
	backendWallet: Address;
}

export const ADDRESS: Record<number, ChainAddress> = {
	[mainnet.id]: {
		backendWallet: zeroAddress,
	},
	[polygon.id]: {
		backendWallet: '0xAbc09B2e5729a0B16143811646e390eeC7036554',
	},
	// @dev: citrea
	[5115 as Chain['id']]: {
		backendWallet: zeroAddress,
	},
};
