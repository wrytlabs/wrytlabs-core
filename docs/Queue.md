# Queue Contract Documentation

## Overview

The `Queue` contract is a smart contract designed for executing batch operations with sophisticated failure handling. It implements ownership controls, configurable limits, and flexible failure management through bitmap-based allowlists.

## Key Features

### 1. **Ownership Control**
- Inherits from OpenZeppelin's `Ownable` contract
- Only the owner can execute batches and modify configuration
- Supports ownership transfer and renunciation

### 2. **Batch Execution**
- Execute multiple actions in a single transaction
- Configurable maximum batch size and value limits
- Gas-efficient execution using `calldata` for read-only parameters

### 3. **Failure Handling**
- Bitmap-based failure allowlist (`allowFailureMap`)
- Granular control over which actions can fail without reverting the entire batch
- Detailed failure reporting with events

### 4. **Security Features**
- Input validation for all parameters
- Replay protection through unique batch IDs
- Configurable target allowlist
- Emergency withdrawal functionality

## Contract Structure

### Core Components

#### Action Struct
```solidity
struct Action {
    address target;     // Target contract address
    uint256 value;      // ETH to send with the call
    bytes data;         // Encoded function call data
}
```

#### Batch Configuration
```solidity
struct BatchConfig {
    uint256 maxActions;           // Maximum actions per batch
    uint256 maxValue;             // Maximum ETH per action
    mapping(address => bool) allowedTargets; // Allowed target addresses
}
```

## Usage Examples

### Basic Batch Execution

```solidity
// Create actions
Action[] memory actions = new Action[](2);

actions[0] = Action({
    target: contractA,
    value: 0,
    data: abi.encodeWithSignature("functionA(uint256)", 42)
});

actions[1] = Action({
    target: contractB,
    value: ethers.parseEther("0.1"),
    data: abi.encodeWithSignature("functionB()")
});

// Execute batch (no failures allowed)
uint256 allowFailureMap = 0;
(bool[] memory results, uint256 batchId) = queue.executeBatch(actions, allowFailureMap);
```

### Failure Handling

```solidity
// Allow specific actions to fail
// Bit 0 = action[0] can fail
// Bit 1 = action[1] can fail
// Bit 2 = action[2] can fail
uint256 allowFailureMap = 2; // Allow action[1] to fail

Action[] memory actions = new Action[](3);
// ... populate actions ...

(bool[] memory results, uint256 batchId) = queue.executeBatch(actions, allowFailureMap);

// Check results
for (uint256 i = 0; i < results.length; i++) {
    if (results[i]) {
        console.log("Action", i, "succeeded");
    } else {
        console.log("Action", i, "failed");
    }
}
```

### Configuration Management

```solidity
// Set maximum actions per batch
await queue.setMaxActions(20);

// Set maximum ETH per action
await queue.setMaxValue(ethers.parseEther("2"));

// Add allowed targets
await queue.allowTarget(contractAddress);

// Remove allowed targets
await queue.disallowTarget(contractAddress);

// Disable target restrictions (allow all targets)
await queue.disableTargetRestrictions();
```

## Failure Map Bitmap

The `allowFailureMap` uses a bitmap where each bit represents whether the corresponding action can fail:

```
Bit Position:  7  6  5  4  3  2  1  0
Action Index:  7  6  5  4  3  2  1  0
```

### Examples:

- `allowFailureMap = 0`: No failures allowed (all actions must succeed)
- `allowFailureMap = 1`: Action[0] can fail
- `allowFailureMap = 2`: Action[1] can fail  
- `allowFailureMap = 3`: Actions[0] and [1] can fail
- `allowFailureMap = 4`: Action[2] can fail
- `allowFailureMap = 255`: All actions can fail

## Events

### BatchExecuted
```solidity
event BatchExecuted(
    uint256 indexed batchId,
    address indexed executor,
    Action[] actions,
    bool[] results,
    uint256 allowFailureMap
);
```

### ActionFailed
```solidity
event ActionFailed(
    uint256 indexed batchId,
    uint256 actionIndex,
    string reason
);
```

## Error Handling

### Custom Errors
- `InvalidActionCount()`: No actions provided
- `ActionExecutionFailed(uint256 index)`: Action failed and not allowed
- `InvalidTargetAddress()`: Target address is zero
- `ValueExceedsMaximum()`: Action value exceeds maximum
- `TargetNotAllowed()`: Target not in allowed list
- `BatchAlreadyExecuted()`: Batch has already been executed
- `BatchSizeExceedsMaximum()`: Too many actions in batch

## Security Considerations

### 1. **Access Control**
- Only the owner can execute batches
- Only the owner can modify configuration
- Only the owner can withdraw funds

### 2. **Input Validation**
- All addresses are validated
- Value limits are enforced
- Batch size limits are enforced

### 3. **Replay Protection**
- Unique batch IDs prevent replay attacks
- Each batch can only be executed once

### 4. **Target Restrictions**
- Configurable allowlist for target contracts
- Can be disabled to allow all targets
- Prevents calls to unauthorized contracts

## Gas Optimization

### 1. **Calldata Usage**
- Uses `calldata` for read-only arrays
- Reduces gas costs for large batches

### 2. **Efficient Validation**
- Validates all inputs before execution
- Fails fast on invalid inputs

### 3. **Minimal Storage**
- Only stores essential configuration
- Uses mappings for efficient lookups

## Best Practices

### 1. **Batch Design**
- Keep batches reasonably sized (10-20 actions)
- Group related operations together
- Consider gas limits for large batches

### 2. **Failure Handling**
- Use failure maps judiciously
- Monitor failed actions through events
- Implement retry mechanisms for failed actions

### 3. **Configuration**
- Set appropriate limits for your use case
- Regularly review and update allowed targets
- Monitor contract balance for ETH operations

### 4. **Testing**
- Test all failure scenarios
- Verify event emissions
- Test with various batch sizes

## Deployment

### Constructor Parameters
```solidity
constructor(uint256 _maxActions, uint256 _maxValue)
```

- `_maxActions`: Maximum number of actions allowed per batch
- `_maxValue`: Maximum ETH value allowed per action

### Example Deployment
```solidity
// Deploy with max 10 actions and max 1 ETH per action
Queue queue = new Queue(10, ethers.parseEther("1"));
```

## Integration Examples

### With ERC20 Token Operations
```solidity
// Approve and transfer tokens
Action[] memory actions = new Action[](2);

// Approve spending
actions[0] = Action({
    target: tokenAddress,
    value: 0,
    data: abi.encodeWithSignature("approve(address,uint256)", spender, amount)
});

// Transfer tokens
actions[1] = Action({
    target: tokenAddress,
    value: 0,
    data: abi.encodeWithSignature("transfer(address,uint256)", recipient, amount)
});

queue.executeBatch(actions, 0);
```

### With DeFi Operations
```solidity
// Deposit to multiple protocols
Action[] memory actions = new Action[](3);

// Deposit to Aave
actions[0] = Action({
    target: aavePool,
    value: 0,
    data: abi.encodeWithSignature("deposit(address,uint256,address,uint16)", 
                                 asset, amount, onBehalfOf, referralCode)
});

// Deposit to Compound
actions[1] = Action({
    target: compoundMarket,
    value: 0,
    data: abi.encodeWithSignature("mint(uint256)", amount)
});

// Allow failures for any action
queue.executeBatch(actions, 7); // Allow all actions to fail
```

## Monitoring and Maintenance

### 1. **Event Monitoring**
- Monitor `BatchExecuted` events for successful batches
- Monitor `ActionFailed` events for failed actions
- Track batch IDs to prevent duplicates

### 2. **Configuration Updates**
- Regularly review and update allowed targets
- Adjust limits based on usage patterns
- Monitor gas costs and optimize batch sizes

### 3. **Emergency Procedures**
- Use `emergencyWithdraw()` to recover funds
- Pause operations if needed (requires additional pausable implementation)
- Transfer ownership to multisig for enhanced security

## Conclusion

The Queue contract provides a robust foundation for batch operations with sophisticated failure handling. Its flexible configuration and security features make it suitable for a wide range of use cases, from simple token operations to complex DeFi interactions.

Key benefits:
- **Gas Efficiency**: Batch multiple operations into single transactions
- **Flexibility**: Configurable limits and failure handling
- **Security**: Comprehensive access controls and validation
- **Reliability**: Replay protection and detailed error reporting 