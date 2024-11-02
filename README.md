# Core

### Scripts

```json
// yarn run <...>

"wallet:info": "npx ts-node helper/WalletInfo.ts",

"compile": "npx hardhat compile",
"build": "tsup",
"publish": "npm publish --access public",

"test": "npx hardhat test",
"coverage": "npx hardhat coverage"
```

# Deployment

### Deploy Contract

```bash
npx hardhat ignition deploy ./ignition/modules/$MODULE.ts --network polygon --deployment-id $ID
```

> Check out ./ignition/deployments/[deployment]/deployed_addresses.json

> Check out ./ignition/deployments/[deployment]/journal.jsonl

### Verity Deployed Contract

```bash
npx hardhat verify --network polygon --constructor-args ./ignition/constructor-args/$FILE.js $ADDRESS
```

# NPM and packages

### @dev: what you fill find & how to publish

To publish new version. `publish: "npm publish --access public"`

-   [x] Exports ready to use TS ABIs
-   [x] Exports ready to use TS Address config
-   [ ]

### @dev: how to transpile package into bundled apps

E.g. for `NextJs` using the `next.config.js` in root of project.

```js
/** @type {import('next').NextConfig} */
const nextConfig = {
	reactStrictMode: true,
	transpilePackages: ['@wrtylabs/core', '@wrytelabs/api'],
};

module.exports = nextConfig;
```
