// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {BaseHook} from "./BaseHook.sol";
import {Hooks} from "./Hooks.sol";
import {IPoolManager} from "./IPoolManager.sol";
import {PoolKey, PoolId, PoolIdLibrary} from "./PoolKey.sol";
import {BalanceDelta, BalanceDeltaLibrary} from "./BalanceDelta.sol";
import {BeforeSwapDelta, BeforeSwapDeltaLibrary} from "./BeforeSwapDelta.sol";
import {Currency, CurrencyLibrary} from "./Currency.sol";

import {IMetaMorphoV1_1} from "../morpho/IMetaMorphoV1_1.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract ZCHFUSDCHook is BaseHook {
    using SafeERC20 for IERC20;
    using PoolIdLibrary for PoolKey;
    
    IMetaMorphoV1_1 public immutable morphoZCHF;
    IMetaMorphoV1_1 public immutable morphoUSDC;
    IERC20 public immutable zchf;
    IERC20 public immutable usdc;
    
    error InvalidToken();
    error InsufficientVaultBalance();
    error DepositFailed();
    error WithdrawFailed();
    
    constructor(
        IPoolManager _poolManager,
        address _morphoZCHF,
        address _morphoUSDC,
        address _zchf,
        address _usdc
    ) BaseHook(_poolManager) {
        morphoZCHF = IMetaMorphoV1_1(_morphoZCHF);
        morphoUSDC = IMetaMorphoV1_1(_morphoUSDC);
        zchf = IERC20(_zchf);
        usdc = IERC20(_usdc);
    }

    function getHookPermissions() public pure override returns (Hooks.Permissions memory) {
        return Hooks.Permissions({
            beforeInitialize: false,
            afterInitialize: false,
            beforeAddLiquidity: true,
            afterAddLiquidity: false,
            beforeRemoveLiquidity: false,
            afterRemoveLiquidity: true,
            beforeSwap: true,
            afterSwap: true,
            beforeDonate: false,
            afterDonate: false,
            beforeSwapReturnDelta: false,
            afterSwapReturnDelta: false,
            afterAddLiquidityReturnDelta: false,
            afterRemoveLiquidityReturnDelta: false
        });
    }

    function beforeAddLiquidity(
        address,
        PoolKey calldata key,
        IPoolManager.ModifyLiquidityParams calldata params,
        bytes calldata hookData
    ) external override returns (bytes4) {
        address user = abi.decode(hookData, (address));
        
        int256 liquidityDelta = params.liquidityDelta;
        if (liquidityDelta > 0) {
            uint256 amount0 = uint256(int256(params.liquidityDelta));
            uint256 amount1 = uint256(int256(params.liquidityDelta));
            
            _depositToMorpho(CurrencyLibrary.unwrap(key.currency0), amount0, user);
            _depositToMorpho(CurrencyLibrary.unwrap(key.currency1), amount1, user);
        }
        
        return BaseHook.beforeAddLiquidity.selector;
    }

    function afterRemoveLiquidity(
        address,
        PoolKey calldata key,
        IPoolManager.ModifyLiquidityParams calldata params,
        BalanceDelta,
        bytes calldata hookData
    ) external override returns (bytes4, BalanceDelta) {
        address user = abi.decode(hookData, (address));
        
        int256 liquidityDelta = params.liquidityDelta;
        if (liquidityDelta < 0) {
            uint256 amount0 = uint256(-liquidityDelta);
            uint256 amount1 = uint256(-liquidityDelta);
            
            _withdrawFromMorpho(CurrencyLibrary.unwrap(key.currency0), amount0, user);
            _withdrawFromMorpho(CurrencyLibrary.unwrap(key.currency1), amount1, user);
        }
        
        return (BaseHook.afterRemoveLiquidity.selector, BalanceDeltaLibrary.wrap(0));
    }

    function beforeSwap(
        address,
        PoolKey calldata key,
        IPoolManager.SwapParams calldata params,
        bytes calldata hookData
    ) external override returns (bytes4, BeforeSwapDelta, uint24) {
        address user = abi.decode(hookData, (address));
        
        address tokenIn = params.zeroForOne ? CurrencyLibrary.unwrap(key.currency0) : CurrencyLibrary.unwrap(key.currency1);
        uint256 amountIn = uint256(params.amountSpecified > 0 ? params.amountSpecified : -params.amountSpecified);
        
        _depositToMorpho(tokenIn, amountIn, user);
        
        return (BaseHook.beforeSwap.selector, BeforeSwapDeltaLibrary.ZERO_DELTA, 0);
    }

    function afterSwap(
        address,
        PoolKey calldata key,
        IPoolManager.SwapParams calldata params,
        BalanceDelta delta,
        bytes calldata hookData
    ) external override returns (bytes4, int128) {
        address user = abi.decode(hookData, (address));
        
        address tokenOut = params.zeroForOne ? CurrencyLibrary.unwrap(key.currency1) : CurrencyLibrary.unwrap(key.currency0);
        int128 deltaAmount = params.zeroForOne ? BalanceDeltaLibrary.amount1(delta) : BalanceDeltaLibrary.amount0(delta);
        uint256 amountOut = uint256(int256(deltaAmount < 0 ? -deltaAmount : deltaAmount));
            
        _withdrawFromMorpho(tokenOut, amountOut, user);
        
        return (BaseHook.afterSwap.selector, 0);
    }

    function _depositToMorpho(address token, uint256 amount, address user) internal {
        if (amount == 0) return;
        
        if (token == address(zchf)) {
            zchf.safeTransferFrom(user, address(this), amount);
            zchf.forceApprove(address(morphoZCHF), amount);
            morphoZCHF.deposit(amount, address(this));
        } else if (token == address(usdc)) {
            usdc.safeTransferFrom(user, address(this), amount);
            usdc.forceApprove(address(morphoUSDC), amount);
            morphoUSDC.deposit(amount, address(this));
        } else {
            revert InvalidToken();
        }
    }

    function _withdrawFromMorpho(address token, uint256 amount, address user) internal {
        if (amount == 0) return;
        
        if (token == address(zchf)) {
            uint256 shares = morphoZCHF.previewWithdraw(amount);
            if (morphoZCHF.balanceOf(address(this)) < shares) {
                revert InsufficientVaultBalance();
            }
            morphoZCHF.withdraw(amount, user, address(this));
        } else if (token == address(usdc)) {
            uint256 shares = morphoUSDC.previewWithdraw(amount);
            if (morphoUSDC.balanceOf(address(this)) < shares) {
                revert InsufficientVaultBalance();
            }
            morphoUSDC.withdraw(amount, user, address(this));
        } else {
            revert InvalidToken();
        }
    }

    function getVaultBalances() external view returns (uint256 zchfShares, uint256 usdcShares) {
        zchfShares = morphoZCHF.balanceOf(address(this));
        usdcShares = morphoUSDC.balanceOf(address(this));
    }

    function getUnderlyingBalances() external view returns (uint256 zchfAssets, uint256 usdcAssets) {
        uint256 zchfShares = morphoZCHF.balanceOf(address(this));
        uint256 usdcShares = morphoUSDC.balanceOf(address(this));
        
        zchfAssets = morphoZCHF.previewRedeem(zchfShares);
        usdcAssets = morphoUSDC.previewRedeem(usdcShares);
    }
}