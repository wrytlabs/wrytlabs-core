// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title MockTarget
 * @notice A simple mock contract for testing Queue functionality
 */
contract MockTarget {
    uint256 public value;
    bool public shouldRevert;

    event ValueSet(uint256 newValue);

    /// @notice Sets the value
    /// @param _value The new value to set
    function setValue(uint256 _value) external {
        value = _value;
        emit ValueSet(_value);
    }

    /// @notice Sets whether the contract should revert on calls
    /// @param _shouldRevert Whether to revert
    function setShouldRevert(bool _shouldRevert) external {
        shouldRevert = _shouldRevert;
    }

    /// @notice A function that always reverts (for testing failure scenarios)
    function revertFunction() external pure {
        revert("MockTarget: This function always reverts");
    }

    /// @notice A function that reverts based on state
    function conditionalRevert() external view {
        require(!shouldRevert, "MockTarget: Conditional revert");
    }

    /// @notice Returns the current value
    /// @return The current value
    function getValue() external view returns (uint256) {
        return value;
    }
} 