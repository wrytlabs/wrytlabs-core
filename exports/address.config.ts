import { arbitrum, avalanche, base, gnosis, mainnet, optimism, polygon, sonic } from 'viem/chains';
import { ChainAddressMap } from './address.types';

export const ADDRESS: ChainAddressMap = {
	[mainnet.id]: {
		// identifier
		chainId: 1,
		chainSelector: '5009297550715157269',

		// aragon daos
		aragonWrytes: '0x5f238e89F3ba043CF202E1831446cA8C5cd40846',
		aragonWrytLabs: '0x220B613fE70bf228C11F781A1d2bAEEA34f71809',

		// savings vaults
		frankencoinSavings: '0x27d9AD987BdE08a0d083ef7e0e4043C857A17B38',
		savingsVaultZCHF: '0x637F00cAb9665cB07d91bfB9c6f3fa8faBFEF8BC',

		// erc20 tokens
		usdc: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
		WETH: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
		cbBTC: '0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf',
		zchf: '0xB58E61C3098d85632Df34EecfB899A1Ed80921cB',
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
