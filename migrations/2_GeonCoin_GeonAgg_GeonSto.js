const GeonCoin = artifacts.require("GeonCoin.sol");
const GeonAgg = artifacts.require("GeonAggregator.sol");
const GeonSto = artifacts.require("GeonStorage.sol");

module.exports = async (deployer) => {
    /**
     * Deploy all contracts.
     */
    await deployer.deploy(GeonCoin);
    let coin = await GeonCoin.deployed();

    await deployer.deploy(GeonAgg);
    let agg = await GeonAgg.deployed();

    await deployer.deploy(GeonSto);
    let sto = await GeonSto.deployed();
    
    /**
     * Update all references.
     */
    await coin.updateGeonTopupAddress(agg.address);
    await agg.updateRewardToken(coin.address);
    await agg.updateStorage(sto.address);
    await sto.addWhitelisted(agg.address);
}