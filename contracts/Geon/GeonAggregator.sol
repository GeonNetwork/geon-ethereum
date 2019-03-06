pragma solidity ^0.5.2;

import "openzeppelin-solidity/contracts/lifecycle/Pausable.sol";
import "openzeppelin-solidity/contracts/math/SafeMath.sol";
import "openzeppelin-solidity/contracts/ownership/Ownable.sol";
import "openzeppelin-solidity/contracts/token/ERC20/IERC20.sol";
import "./GeonStorage.sol";
import "./IGeonTopup.sol";

/**
 * @title Geon Aggregator - used to manage Geons and geomining.
 * @author Geon Network Ltd.
 * @dev After deployment, the reward token and storage contracts must be set as follows (GeonCoin and GeonStorage contracts used as examples):
 *   GeonAggregator.updateRewardToken(GeonCoin.address)
 *   GeonAggregator.updateStorage(GeonStorage.address)
 */
contract GeonAggregator is Ownable, Pausable, IGeonTopup {
    using SafeMath for uint256;

    event GeonCreated(bytes16 indexed geonId, address indexed sender, uint256 geonCount);
    event GeonDeleted(bytes16 indexed geonId, address indexed sender, address rewardToken, uint256 outstandingRewardBalance, uint256 geonCount);
    event Geomine(bytes16 indexed geonId, address indexed geominer, bytes16 geominingReqId, address rewardToken, uint256 rewardAmount);
    event StorageUpdated(address newGeonStorage);
    event RewardTokenUpdated(address newRewardToken);
    event SelfDestroyed(address beneficiary, uint256 balance);

    /**
     * Tracks the total number of Geons maintained by this contract.
     * @dev Note that other GeonAgg contracts can manage (and also delete) Geons created by this contract, in which case this counter can get out of sync.
     * This is by design. In an upgrade scenario, where this contract is replaced by a another one, the new one must be able to manage Geons created by this one.
     * This is also done to enable remediation in cases where a bug in this contract prevents it from updating or deleting a Geon.
     * For this reason, any GeonAgg taking over from this one should set its geonCount during intialization. The common case, however, is that every GeonAgg should manage its own Geons and geonCount.
     */
    uint256 public geonCount = 0;
    
    /**
     * Storage contract we are using.
     */
    GeonStorage public geonStorage;

    /**
     * Reward token contract. Used whenever we need to transfer reward tokens, e.g. when geomining or deleting a Geon.
     */
    IERC20 public rewardToken;

    /**
     * Changes the storage contract we are using.
     * @dev This should be used during initializatino stage, i.e. before the first use, or in case the storage contract has to be replaced for some reason. Is it assumed that in both cases geonCount will be 0 (e.g. all Geons have been deleted
     * in old storage and we can safely upgrade to new storage). If we need to migrate to another storage when geonCount is not 0 (i.e. not all Geons have been deleted on old storage), this contract will have to be redeployed,
     * as by desing it is not possible to reset geonCount.
     */
    function updateStorage(GeonStorage _geonStorage) external onlyOwner {
        geonStorage = _geonStorage;

        emit StorageUpdated(address(geonStorage));
    }

    /**
     * Changes the reward token contract we are using.
     * @dev WARNING: If there are any outstanding old token balances stored in Geons, they must be copied (e.g. minted) in the new token contract or they will become corrupted.
     * This should really be only used during initialization or in emergency situations where the reward token contract itself must be upgraded for some reason.
     */
    function updateRewardToken(IERC20 _rewardToken) external onlyOwner {
        rewardToken = _rewardToken;

        emit RewardTokenUpdated(address(rewardToken));
    }

    /**
     * Creates a Geon.
     * @param _geonId A Geon identifier defined and used by the Dapp to refer to this Geon.
     */
    function createGeon(bytes16 _geonId) external whenNotPaused {
        _createGeon(_geonId);
    }

    /**
     * Creates multiple Geons in one call.
     * @dev The number of Geons that can be created is limited by the block gas limit.
     * @param _geonIds An array of Geon IDs of Geons to be created.
     */
    function createGeons(bytes16[] calldata _geonIds) external whenNotPaused {
        for (uint256 i = 0; i < _geonIds.length; i++) {
            // TODO: If this reverts, ideally we should return a meaningful error message saying which _geonId (or index) failed.
            _createGeon(_geonIds[i]);
        }
    }

    /**
     * Retrieves the Geon data from storage and returns it all in a tuple.
     */
    function getGeon(bytes16 _geonId) external view returns (bytes16 id, address creator, uint256 rewardTokenOwned) {
        require(_geonExists(_geonId), "Geon with this ID does not exist.");

        return (_geonId, _getGeonCreator(_geonId), _getRewardTokenOwned(_geonId));
    }

    /**
     * Called by the reward token contract to notify us about the received tokens.
     * @dev The tokens must be transferred or allowed to this contract.
     */
    function increaseGeonBalance(bytes16 _geonId, uint256 _amount) external whenNotPaused {
        require(msg.sender == address(rewardToken), "Can only be called by the reward token contract.");

        uint256 oldBalance = _getRewardTokenOwned(_geonId);
        uint256 newBalance = oldBalance.add(_amount);
        _storeRewardTokenOwned(_geonId, newBalance);

        emit GeonBalanceIncreased(_geonId, address(rewardToken), oldBalance, _amount, newBalance);
    }

    /**
     * Deletes the Geon and transfers all the remaining reward tokens owned by the Geon to the caller.
     * @dev Can only be called by the Geon creator.
     */
    function deleteGeon(bytes16 _geonId) external whenNotPaused {
        require(msg.sender == _getGeonCreator(_geonId), "Can only be called by the Geon creator.");

        uint256 outstandingRewardBalance = _getRewardTokenOwned(_geonId);

        _deleteGeon(_geonId);
        _deleteGeonCreator(_geonId);
        _deleteRewardTokenOwned(_geonId);

        _decreaseGeonCountSafe();        

        if(outstandingRewardBalance > 0) {
            rewardToken.transfer(msg.sender, outstandingRewardBalance);
        }

        emit GeonDeleted(_geonId, msg.sender, address(rewardToken), outstandingRewardBalance, geonCount);
    }

    /**
     * Gets the geomining reward for a specific Geon, miner, and geomining request ID.
     */
    function getGeominingReward(bytes16 _geonId, address _miner, bytes16 _geominingReqId) external view returns (uint256) {
        return _getGeominingReward(_geonId, _miner, _geominingReqId);
    }

    /**
     * Sets the geomining reward for a specific geomining request.
     * @dev Can only be called by the Dapp.
     * @param _geominingReqId Identifies a specific geomining request. It is set by the Dapp. The geominer should supsequently call geomine() to claim the reward for this _geominingReqId.
     */
    function setGeominingReward(bytes16 _geonId, address _miner, bytes16 _geominingReqId, uint256 _rewardTokenAmount) external onlyOwner whenNotPaused {
        require(_geonExists(_geonId), "Geon with this ID does not exist.");

        _storeGeominingReward(_geonId, _miner, _geominingReqId, _rewardTokenAmount);
    }

    /**
     * Called by a geominer to claim the reward.
     */
    function geomine(bytes16 _geonId, bytes16 _geominingReqId) external whenNotPaused {
        address miner = msg.sender;
        uint256 rewardAmount = _getGeominingReward(_geonId, miner, _geominingReqId);

        _storeGeominingReward(_geonId, miner, _geominingReqId, 0);
        _storeRewardTokenOwned(_geonId, _getRewardTokenOwned(_geonId).sub(rewardAmount));
        rewardToken.transfer(miner, rewardAmount);

        emit Geomine(_geonId, miner, _geominingReqId, address(rewardToken), rewardAmount);
    }

    /**
     * To be used at end of life.
     * @dev When sunsetting this contract, please remember to remove it from the GeonStorage whitelist. We could do it here, but it may not be reliable
     * (e.g. if we've already been removed from the whitelist, the call to renounce being whitelisted would revert and we couldn't selfdestroy).
     */
    function destroy() external onlyOwner whenPaused {
        emit SelfDestroyed(msg.sender, address(this).balance);
        selfdestruct(msg.sender);
    }

    /**
     * Computes the Geon storage record key, i.e. the main key under which all Geon data should be stored in the storage contract. It is used to compute keys for all other Geon data.
     */
    function _getGeonKey(bytes16 _geonId) internal pure returns (bytes32) {
        return keccak256(abi.encode(_geonId));
    }

    /**
     * Computes the Geon.creator storage record key.
     */
    function _getGeonCreatorKey(bytes16 _geonId) internal pure returns (bytes32) {
        return keccak256(abi.encode(_getGeonKey(_geonId), "Geon.creator"));
    }

    /**
     * Computes the Geon.rewardTokenOwned storage record key.
     */
    function _getRewardTokenOwnedKey(bytes16 _geonId) internal pure returns (bytes32) {
        return keccak256(abi.encode(_getGeonKey(_geonId), "Geon.rewardTokenOwned"));
    }

    /**
     * Computes the Geon.miner.geominingReq.reward storage record key.
     */
    function _getGeominingRewardKey(bytes16 _geonId, address _miner, bytes16 _geominingReqId) internal pure returns (bytes32) {
        return keccak256(abi.encode(_getGeonKey(_geonId), _miner, _geominingReqId, "Geon.miner.geominingReq.reward"));
    }

    /**
     * Calls the storage contract to check if the Geon with this ID exists.
     * @return True if the Geon exists, false otherwise.
     */
    function _geonExists(bytes16 _geonId) internal view returns (bool) {
        return geonStorage.geonExists(_getGeonKey(_geonId));
    }

    /**
     * Retrieves the Geon creator address from the storage contract.
     */
    function _getGeonCreator(bytes16 _geonId) internal view returns (address) {
        require(_geonExists(_geonId), "Geon with this ID does not exist.");

        return geonStorage.getAddress(_getGeonCreatorKey(_geonId));
    }

    /**
     * Retrieves the amount of reward tokens owned by the Geon from the storage contract.
     */
    function _getRewardTokenOwned(bytes16 _geonId) internal view returns (uint256) {
        require(_geonExists(_geonId), "Geon with this ID does not exist.");

        return geonStorage.getUint256(_getRewardTokenOwnedKey(_geonId));
    }

    /**
     * Retrieves the geomining reward for a particular Geon, geomining request, and miner from the storage contract.
     * @param _geominingReqId Dapp defined geomining request for which the reward is returned.
     */
    function _getGeominingReward(bytes16 _geonId, address _miner, bytes16 _geominingReqId) internal view returns (uint256) {
        require(_geonExists(_geonId), "Geon with this ID does not exist.");

        return geonStorage.getUint256(_getGeominingRewardKey(_geonId, _miner, _geominingReqId));
    }

    /**
     * Creates Geon in the storage contract.
     */
    function _createGeonInStorage(bytes16 _geonId) internal {
        geonStorage.createGeon(_getGeonKey(_geonId));
    }

    /**
     * Deletes Geon in the storage contract.
     */
    function _deleteGeon(bytes16 _geonId) internal {
        geonStorage.deleteGeon(_getGeonKey(_geonId));
    }

    /**
     * Stores the Geon creator address in the storage contract.
     */
    function _storeGeonCreator(bytes16 _geonId, address _creator) internal {
        geonStorage.setAddress(_getGeonCreatorKey(_geonId), _creator);
    }

    /**
     * Deletes the record storing Geon creator address in the storage contract.
     */
    function _deleteGeonCreator(bytes16 _geonId) internal {
        geonStorage.deleteAddress(_getGeonCreatorKey(_geonId));
    }

    /**
     * Stores the amount of tokens owned by the Geon in the storage contract.
     */
    function _storeRewardTokenOwned(bytes16 _geonId, uint256 _amount) internal {
        geonStorage.setUint256(_getRewardTokenOwnedKey(_geonId), _amount);
    }

    /**
     * Deletes the record storing the amount of tokens owned by the Geon in the storage contract.
     */
    function _deleteRewardTokenOwned(bytes16 _geonId) internal {
        geonStorage.deleteUint256(_getRewardTokenOwnedKey(_geonId));
    }

    /**
     * Stores the geomining reward for a particular Geon, geomining request, and miner, in the storage contract.
     */
    function _storeGeominingReward(bytes16 _geonId, address _miner, bytes16 _geominingReqId, uint256 _rewardTokenAmount) internal {
        geonStorage.setUint256(_getGeominingRewardKey(_geonId, _miner, _geominingReqId), _rewardTokenAmount);
    }

    /**
     * Increases geonCount by one. If the result overflows, does nothing.
     * @dev Safe version of SafeMath.add(), which actually reverts on overflow.
     */
    function _increaseGeonCountSafe() internal {
        if (geonCount + 1 > geonCount) {
            geonCount++;
        }
    }

    /**
     * Decreases geonCount by one. If the result overflows, does nothing.
     * @dev Safe version of SafeMath.sub(), which actually reverts on overflow.
     */
    function _decreaseGeonCountSafe() internal {
        if (geonCount > 0) {
            geonCount--;
        }
    }

    /**
     * Creates a Geon and stores it in storage.
     * @param _geonId A Geon identifier defined and used by the caller to refer to this Geon.
     */
    function _createGeon(bytes16 _geonId) internal {
        require(!_geonExists(_geonId), "Geon with this ID already exists.");

        _createGeonInStorage(_geonId);
        _storeGeonCreator(_geonId, msg.sender);
        
        _increaseGeonCountSafe();

        emit GeonCreated(_geonId, msg.sender, geonCount);
    }
}