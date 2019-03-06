pragma solidity ^0.5.2;

import "openzeppelin-solidity/contracts/math/SafeMath.sol";
import "openzeppelin-solidity/contracts/ownership/Ownable.sol";
import "openzeppelin-solidity/contracts/token/ERC20/ERC20Burnable.sol";
import "openzeppelin-solidity/contracts/token/ERC20/ERC20Detailed.sol";
import "openzeppelin-solidity/contracts/token/ERC20/ERC20Mintable.sol";
import "openzeppelin-solidity/contracts/token/ERC20/ERC20Pausable.sol";
import "../Geon/IGeonTopup.sol";

/**
 * @title GeonCoin - an ERC20 token used as an in-app reward token in Geon Network.
 * @author Geon Network Ltd.
 * @dev After deployment, the Geon topup contract must be set as follows:
 *   GeonCoin.updateGeonTopupAddress(IGeonTopup.address)
 */
contract GeonCoin is ERC20Detailed("GeonCoin", "GC", 18), ERC20Burnable, ERC20Mintable, ERC20Pausable, Ownable {
    using SafeMath for uint256;

    /**
     * Contract that will receive messages whenever a Geon is topped up.
     */
    IGeonTopup public geonTopup;

    function updateGeonTopupAddress(IGeonTopup _geonTopup) external onlyOwner {
        geonTopup = _geonTopup;
    }

    /**
     * Notifies geonTopup about which Geon received coins and performs the transfer.
     */
    function transferToGeon(bytes16 _geonId, uint256 _amount) external returns (bool) {
        geonTopup.increaseGeonBalance(_geonId, _amount);
        
        return super.transfer(address(geonTopup), _amount);
    }

    /**
     * Notifies geonTopup about which Geons received coins and performs the transfer.
     */
    function transferToGeons(bytes16[] calldata _geonIds, uint256[] calldata _amounts) external returns (bool) {
        require(_geonIds.length == _amounts.length, "Arrays _geonIds and _amounts must be the same length.");
        require(_geonIds.length > 0, "Arrays _geonIds and _amounts contain no elements.");

        uint256 totalAmount = 0;

        for (uint256 i = 0; i < _geonIds.length; i++) {
            geonTopup.increaseGeonBalance(_geonIds[i], _amounts[i]);
            totalAmount = totalAmount.add(_amounts[i]);
        }
        
        require(totalAmount > 0, "The total transfer amount must be greater than 0.");

        address geonTopupAddress = address(geonTopup);

        // Check for overflow.
        if (balanceOf(geonTopupAddress) + totalAmount < balanceOf(geonTopupAddress)) {
            revert("The total transfer amount is too large.");
        }

        return super.transfer(geonTopupAddress, totalAmount);
    }
}