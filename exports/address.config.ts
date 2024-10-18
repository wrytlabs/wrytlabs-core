import { polygon } from 'viem/chains';
import { Address, zeroAddress } from 'viem';

export interface ChainAddress {
	asdf: Address;
	aaaa: Address;

	// accept any optional key
	[key: string]: Address | undefined;
}

export const ADDRESS: Record<number, ChainAddress> = {
	// [polygon.id]: {
	// 	asdf: 'asdf',
	// 	aaaa: 'asdf',
	// },
};
