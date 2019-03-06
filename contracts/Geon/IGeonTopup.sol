pragma solidity ^0.5.2;

/**
 * @title Geon Topup - interface that must be implemented by any GeonAgg that wants to receive Geon topup messages.
 * @author Geon Network Ltd.
 */
interface IGeonTopup {
    event GeonBalanceIncreased(bytes16 indexed geonId, address rewardToken, uint256 oldBalance, uint256 delta, uint256 newBalance);

    function increaseGeonBalance(bytes16 _geonId, uint256 _amount) external;
}