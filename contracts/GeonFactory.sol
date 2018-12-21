pragma solidity ^0.5.1;

import "./Geon.sol";

/**
 * @title Geon Factory
 * @dev Spawns new Geons on the blockchain.
 */
contract GeonFactory {
    event GeonCreatedEvent(Geon geon, int latitude, int longitude, address token);
    
    /**
    * @dev Creates a new smart contract that represents a Geon.
    * @param _latitude Latidute coordinate of te Geon.
    * @param _longitude Longitude coordinate of te Geon.
    * @param _token Address of the Geon Coin token.
    */
    function CreateGeon(int _latitude, int _longitude, address _token) public payable returns (Geon newGeon) {
        newGeon = new Geon(_latitude, _longitude, _token);
        
        // TODO: Provision Geon Coins for newGeon (either transfer or approve).

        emit GeonCreatedEvent(newGeon, _latitude, _longitude, _token);
    }

    // Don't accept funds by default.
    function () payable external {
        revert();
    }
}