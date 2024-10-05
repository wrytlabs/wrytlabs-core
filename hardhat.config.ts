import '@nomicfoundation/hardhat-ethers';
import '@nomicfoundation/hardhat-verify';
import '@nomicfoundation/hardhat-toolbox';
import '@nomicfoundation/hardhat-network-helpers';
import '@nomicfoundation/hardhat-ignition-ethers';
import 'hardhat-deploy';
import 'hardhat-abi-exporter';
import 'hardhat-contract-sizer';
import { HardhatUserConfig } from 'hardhat/config';
import { getChildFromSeed } from './helper/wallet';

import dotenv from 'dotenv';
dotenv.config();

const seed = process.env.DEPLOYER_ACCOUNT_SEED;
if (!seed) throw new Error('Failed to import the seed string from .env');
const w0 = getChildFromSeed(seed, 0); // deployer

const config: HardhatUserConfig = {
	solidity: {
		version: '0.7.6',
		settings: {
			optimizer: {
				enabled: true,
				runs: 200,
			},
		},
	},
	networks: {
		polygon: {
			url: process.env.RPC_URL_POLYGON,
			chainId: 137,
			gas: 'auto',
			gasPrice: 'auto',
			accounts: [w0.privateKey],
			timeout: 50_000,
		},
	},
	etherscan: {
		apiKey: process.env.POLYSCAN_API,
	},
	sourcify: {
		enabled: true,
	},
	namedAccounts: {
		deployer: {
			default: 0,
		},
	},
	paths: {
		sources: './contracts',
		tests: './test',
		cache: './cache',
		artifacts: './artifacts',
	},
	contractSizer: {
		alphaSort: false,
		runOnCompile: false,
		disambiguatePaths: false,
	},
	gasReporter: {
		enabled: true,
		currency: 'USD',
	},
	abiExporter: [
		{
			path: './abi',
			clear: true,
			runOnCompile: true,
			flat: true,
			spacing: 4,
			pretty: false,
		},
		{
			path: './abi/signature',
			clear: true,
			runOnCompile: true,
			flat: true,
			spacing: 4,
			pretty: true,
		},
	],
	mocha: {
		timeout: 120000,
	},
	typechain: {
		outDir: 'typechain',
		target: 'ethers-v6',
	},
};

export default config;
