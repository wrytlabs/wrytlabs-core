import { arbitrum, avalanche, base, gnosis, mainnet, optimism, polygon, sonic } from 'viem/chains';
import { Address, Hash } from 'viem';

export type ChainIdMain = typeof mainnet.id;

export type ChainIdSide =
	| typeof polygon.id
	| typeof arbitrum.id
	| typeof optimism.id
	| typeof base.id
	| typeof avalanche.id
	| typeof gnosis.id
	| typeof sonic.id;

export type ChainId = ChainIdMain | ChainIdSide;

export type ChainAddressMainnet = {
	// identifier
	chainId: typeof mainnet.id;
	chainSelector: string;

	// DAOs and owners
	aragonWrytes: Address;
	aragonWrytLabs: Address;

	// savings vaults
	frankencoinSavings: Address;
	savingsVaultZCHF: Address;
	savingsVaultZCHFMorpho: Address;

	// morpho related
	morphoBlue: Address;
	morphoIrm: Address;
	morphoChainlinkOracleV2Factory: Address;
	morphoMetaMorphoFactory1_1: Address;
	morphoPublicAllocator: Address;
	morphoURD: Address;

	// morpho market ids
	marketZCHFSVZCHF: Hash;
	marketZCHFSVZCHFOracle: Address;

	// erc20 tokens
	usdc: Address;
	WETH: Address;
	cbBTC: Address;
	zchf: Address;
};

export type ChainAddressPolygon = {
	// identifier
	chainId: typeof polygon.id;
	chainSelector: string;
};

export type ChainAddressArbitrum = {
	// identifier
	chainId: typeof arbitrum.id;
	chainSelector: string;
};

export type ChainAddressOptimism = {
	// identifier
	chainId: typeof optimism.id;
	chainSelector: string;
};

export type ChainAddressBase = {
	// identifier
	chainId: typeof base.id;
	chainSelector: string;
};

export type ChainAddressAvalanche = {
	// identifier
	chainId: typeof avalanche.id;
	chainSelector: string;
};

export type ChainAddressGnosis = {
	// identifier
	chainId: typeof gnosis.id;
	chainSelector: string;
};

export type ChainAddressSonic = {
	// identifier
	chainId: typeof sonic.id;
	chainSelector: string;
};

export type ChainAddressMap = {
	[mainnet.id]: ChainAddressMainnet;
	[polygon.id]: ChainAddressPolygon;
	[arbitrum.id]: ChainAddressArbitrum;
	[optimism.id]: ChainAddressOptimism;
	[base.id]: ChainAddressBase;
	[avalanche.id]: ChainAddressAvalanche;
	[gnosis.id]: ChainAddressGnosis;
	[sonic.id]: ChainAddressSonic;
};
