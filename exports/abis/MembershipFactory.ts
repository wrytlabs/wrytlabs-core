export const MembershipFactoryABI = [
	{
		anonymous: false,
		inputs: [
			{
				indexed: false,
				internalType: 'address',
				name: 'membership',
				type: 'address',
			},
		],
		name: 'Created',
		type: 'event',
	},
	{
		inputs: [
			{
				internalType: 'address',
				name: 'admin',
				type: 'address',
			},
			{
				internalType: 'address',
				name: 'executor',
				type: 'address',
			},
			{
				internalType: 'address',
				name: 'member',
				type: 'address',
			},
		],
		name: 'createMembership',
		outputs: [
			{
				internalType: 'address',
				name: '',
				type: 'address',
			},
		],
		stateMutability: 'nonpayable',
		type: 'function',
	},
] as const;
