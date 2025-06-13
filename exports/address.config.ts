import { arbitrum, avalanche, base, gnosis, mainnet, optimism, polygon, sonic } from 'viem/chains';
import { ChainAddressMap } from './address.types';

export const ADDRESS: ChainAddressMap = {
	[mainnet.id]: {
		// identifier
		chainId: 1,
		chainSelector: '5009297550715157269',
	},
	[polygon.id]: {
		// identifier
		chainId: 137,
		chainSelector: '4051577828743386545',
	},
	[arbitrum.id]: {
		// identifier
		chainId: 42161,
		chainSelector: '4949039107694359620',
	},
	[optimism.id]: {
		// identifier
		chainId: 10,
		chainSelector: '3734403246176062136',
	},
	[base.id]: {
		// identifier
		chainId: 8453,
		chainSelector: '15971525489660198786',
	},
	[avalanche.id]: {
		// identifier
		chainId: 43114,
		chainSelector: '6433500567565415381',
	},
	[gnosis.id]: {
		// identifier
		chainId: 100,
		chainSelector: '465200170687744372',
	},
	[sonic.id]: {
		// identifier
		chainId: 146,
		chainSelector: '1673871237479749969',
	},
} as const;
