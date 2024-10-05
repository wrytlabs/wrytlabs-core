# Core

# Scripts

```json
yarn run ...

"compile": "npx hardhat compile",
"test": "npx hardhat test",
"coverage": "npx hardhat coverage",
"publish": "npm publish --access public",
"wallet:info": "npx ts-node helper/WalletInfo.ts"
```

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
