pragma solidity ^0.5.2;

import "openzeppelin-solidity/contracts/access/roles/WhitelistedRole.sol";
import "openzeppelin-solidity/contracts/lifecycle/Pausable.sol";

/**
 * @title Geon Storage - used to store information about Geons. Follows the Eternal Storage pattern.
 * @author Geon Network Ltd.
 * @dev After deployment, all GeonAggregators (i.e. users of this contract) must be added to the whitelist like so:
 *   GeonStorage.addWhitelisted(GeonAggregator.address)
 */
contract GeonStorage is WhitelistedRole, Pausable {
    event GeonCreated(bytes32 indexed geonKey, address indexed sender, uint256 geonCount);
    event GeonDeleted(bytes32 indexed geonKey, address indexed sender, uint256 geonCount);
    event SelfDestroy(address beneficiary, uint256 balance);

    /**
     * Tracks the total number of Geons stored in this contract.
     * @dev All GeonAggregators using this storage contract should use the functions createGeon() and deleteGeon() when creating and deleting Geons.
     * Otherwise, geonCount will not reflect the true number.
     */
    uint256 public geonCount = 0;

    /**
     * Generic storage mappings.
     */
    mapping(bytes32 => bool) boolStorage;
    mapping(bytes32 => int256) int256Storage;
    mapping(bytes32 => uint256) uint256Storage;
    mapping(bytes32 => address) addressStorage;
    mapping(bytes32 => bytes) bytesStorage;
    mapping(bytes32 => string) stringStorage;

    /**
     * Geon management functions.
     */
    function createGeon(bytes32 _key) external onlyWhitelisted whenNotPaused {
        require(!_getBool(_key), "Geon with this key already exists.");
        
        _setBool(_key, true);

        // Safe increase geonCount.
        if (geonCount + 1 > geonCount) {
            geonCount++;
        }

        emit GeonCreated(_key, msg.sender, geonCount);
    }

    function deleteGeon(bytes32 _key) external onlyWhitelisted whenNotPaused {   
        require(_getBool(_key), "Geon with this key does not exist.");

        _setBool(_key, false); // Appears to be a few wei cheaper than _deleteBool().
        
        // Safe decrease geonCount.
        if (geonCount > 0) {
            geonCount--;
        }
        
        emit GeonDeleted(_key, msg.sender, geonCount);
    }

    function geonExists(bytes32 _key) external view returns (bool) {
        return _getBool(_key);
    }

    /** We first include all external functions that define the public interface. */

    /**
     * bool
     */
    function getBool(bytes32 _key) external view returns (bool) {
        return boolStorage[_key];
    }

    function setBool(bytes32 _key, bool _value) external onlyWhitelisted whenNotPaused {
        boolStorage[_key] = _value;
    }

    function deleteBool(bytes32 _key) external onlyWhitelisted whenNotPaused {
        delete boolStorage[_key];
    }

    /**
     * int256
     */
    function getInt256(bytes32 _key) external view returns (int256) {
        return int256Storage[_key];
    }

    function setInt256(bytes32 _key, int256 _value) external onlyWhitelisted whenNotPaused {
        int256Storage[_key] = _value;
    }

    function deleteInt256(bytes32 _key) external onlyWhitelisted whenNotPaused {
        delete int256Storage[_key];
    }

    /**
     * uint256
     */
    function getUint256(bytes32 _key) external view returns (uint256) {
        return uint256Storage[_key];
    }

    function setUint256(bytes32 _key, uint256 _value) external onlyWhitelisted whenNotPaused {
        uint256Storage[_key] = _value;
    }

    function deleteUint256(bytes32 _key) external onlyWhitelisted whenNotPaused {
        delete uint256Storage[_key];
    }

    /**
     * address
     */
    function getAddress(bytes32 _key) external view returns (address) {
        return addressStorage[_key];
    }

    function setAddress(bytes32 _key, address _value) external onlyWhitelisted whenNotPaused {
        addressStorage[_key] = _value;
    }

    function deleteAddress(bytes32 _key) external onlyWhitelisted whenNotPaused {
        delete addressStorage[_key];
    }

    /**
     * bytes
     */
    function getBytes(bytes32 _key) external view returns (bytes memory) {
        return bytesStorage[_key];
    }

    function setBytes(bytes32 _key, bytes calldata _value) external onlyWhitelisted whenNotPaused {
        bytesStorage[_key] = _value;
    }

    function deleteBytes(bytes32 _key) external onlyWhitelisted whenNotPaused {
        delete bytesStorage[_key];
    }

    /**
     * string
     */
    function getString(bytes32 _key) external view returns (string memory) {
        return stringStorage[_key];
    }

    function setString(bytes32 _key, string calldata _value) external onlyWhitelisted whenNotPaused {
        stringStorage[_key] = _value;
    }

    function deleteString(bytes32 _key) external onlyWhitelisted whenNotPaused {
        delete stringStorage[_key];
    }

    /**
     * To be used when this storage contract is deprecated and replaced with one or more new ones.
     * @dev Ensure any dependent GeonAggs update their storage addresses before this is called.
     */
    function destroy() external onlyWhitelistAdmin whenPaused {
        emit SelfDestroy(msg.sender, address(this).balance);
        selfdestruct(msg.sender);
    }

    /** Internal functions. */

    /**
     * bool
     */
    function _getBool(bytes32 _key) internal view returns (bool) {
        return boolStorage[_key];
    }

    function _setBool(bytes32 _key, bool _value) internal onlyWhitelisted whenNotPaused {
        boolStorage[_key] = _value;
    }

    // function _deleteBool(bytes32 _key) external onlyWhitelisted whenNotPaused {
    //     delete boolStorage[_key];
    // }
}