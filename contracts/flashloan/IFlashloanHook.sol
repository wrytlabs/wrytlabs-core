// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IFlashloanOrchestrator} from './IFlashloanOrchestrator.sol';

interface IFlashloanHook {
	function orchestrator() external returns (IFlashloanOrchestrator);

	function onFlashloanHook(bytes calldata data) external payable returns (bytes memory);
}
