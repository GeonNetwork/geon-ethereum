pragma solidity ^0.5.1;

import "openzeppelin-solidity/contracts/token/ERC20/BasicToken.sol";

/**
 * @title Geon
 * @dev Represents a Geon and enforces geomining rules.
 */
contract Geon {
    int public latitude;
    int public longitude;
    BasicToken public token;
        
    event TopUpEvent(address from, uint value);
    event RewardUserEvent(int latitude, int longitude, address user, bool retVal);
    event LocCheckFailedEvent(int latitude, int longitude, address user);
    event RewardUserTxCost(uint256 gasAmount, uint256 gasPrice, uint256 ethAmount);
    
    constructor(int _latitude, int _longitude, address _token) public payable {
        latitude = _latitude;
        longitude = _longitude;
        token = BasicToken(_token);
    }
    
    function () payable external {
        revert("This contract does not accept funds directly.");
    }

    /**
    * @dev Verifies the submitted geolocation claim and rewards user with Geon Coins.
    * @param _user User address the will be rewarded.
    * @param _latitude Latitude corrdinate in the geolocation claim.
    * @param _longitude Longitude corrdinate in the geolocation claim.
    * @param _rewardValue Amount of Geon Coins that will be transferred to the _user account.
    */
    function RewardUser(address _user, int _latitude, int _longitude, uint _rewardValue) public returns (bool) {
        uint256 remainingGasAtStart = gasleft();

        bool retVal = false;

        if(_latitude != latitude || _longitude != longitude) {
            emit LocCheckFailedEvent(_latitude, _longitude, _user);
            retVal = false;
        }
        else {
            token.transfer(_user, _rewardValue);
            retVal = true;
        }
        
        token.transfer(_user, _rewardValue);
        retVal = true;
        
        emit RewardUserEvent(_latitude, _longitude, _user, retVal);
        
        uint256 gasSpent = 21000 + (remainingGasAtStart - gasleft());

        // TODO: This is an approximate tx cost. Refine this and use it to return the cost to the caller (i.e. the Geon Network service).
        emit RewardUserTxCost(gasSpent, tx.gasprice, gasSpent * tx.gasprice);
        
        return retVal;
    }
}