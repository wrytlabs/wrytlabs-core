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
		savingsVaultZCHFMorpho: '0x2c89f7A92d4668124bC85E56a8d01D6B009e11e8',

		// morpho related
		morphoBlue: '0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb',
		morphoIrm: '0x870aC11D48B15DB9a138Cf899d20F13F79Ba00BC',
		morphoChainlinkOracleV2Factory: '0x3A7bB36Ee3f3eE32A60e9f2b33c1e5f2E83ad766',
		morphoMetaMorphoFactory1_1: '0x1897A8997241C1cD4bD0698647e4EB7213535c24',
		morphoPublicAllocator: '0xfd32fA2ca22c76dD6E550706Ad913FC6CE91c75D',
		morphoURD: '0x330eefa8a787552DC5cAd3C3cA644844B1E61Ddb',

		// morpho market ids
		marketZCHFSVZCHF: '0xF93F7E4FEF01B912B261262977FCC30FCD91095D5708732BBE141F4A41778F4D',
		marketZCHFSVZCHFOracle: '0x8E80Ed322634f7df749710cf26B98dccC4ebd566',

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
