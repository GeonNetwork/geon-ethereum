pragma solidity ^0.4.24;

import "./Geon.sol";

/**
 * @title Geon Factory
 * @dev Spawns new Geons on the blockchain.
 */
contract GeonFactory {
    event GeonCreatedEvent(address geon, int latitude, int longitude, address token);
    
    /**
    * @dev Creates a new smart contract that represents a Geon.
    * @param _latitude Latidute coordinate of te Geon.
    * @param _longitude Longitude coordinate of te Geon.
    * @param _token Address of the Geon Coin token.
    */
    function CreateGeon(int _latitude, int _longitude, address _token) public payable returns (address newGeon) {
        newGeon = new Geon(_latitude, _longitude, _token);
        newGeon.transfer(msg.value);
        
        emit GeonCreatedEvent(newGeon, _latitude, _longitude, _token);
    }

    // Don't accept funds by default.
    function () payable public {
        revert();
    }
}