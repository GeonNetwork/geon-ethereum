const assertReverts = require("./testUtils.js").assertReverts;
const BN = web3.utils.BN;

const GeonCoin = artifacts.require("GeonCoin");
const GeonAgg = artifacts.require("GeonAggregator");
const GeonSto = artifacts.require("GeonStorage");

const DEFAULT_VALUE_BYTES20 = "0x0000000000000000000000000000000000000000";
const DEFAULT_VALUE_ADDRESS = DEFAULT_VALUE_BYTES20;

function assertBNEqual(a, b, errorMsg) {
    assert.strictEqual(new BN(a).cmp(new BN(b)), 0, errorMsg);
}

/*
* @dev It is recommended to pass in expectedRewardTokenOwned as a string to avoid precission loss issues when using Number as descriped here: https://github.com/MikeMcl/bignumber.js/
*/
function verifyGeon({expectedGeonId, expectedCreator, expectedRewardTokenOwned, actualGeon}) {
    let expected = expectedGeonId;
    let actual = actualGeon.id;
    let errorMsg = "Geon ID: actual " + actual + " expected " + expected;
    assert.strictEqual(actual, expected, errorMsg);

    expected = expectedCreator;
    actual = actualGeon.creator;
    errorMsg = "Geon creator: actual " + actual + " expected " + expected;
    assert.strictEqual(actual, expected, errorMsg);

    expected = expectedRewardTokenOwned;
    actual = actualGeon.rewardTokenOwned;
    errorMsg = "Reward token owned: actual " + actual + " expected " + expected;
    assertBNEqual(actual, expected, errorMsg);
}

function byteArrayToHexString(arr) {
    let retVal = "";
    for (let i = 0; i < arr.length; i++) {
        if (arr[i] < 16) {
            retVal += "0" + arr[i].toString(16);
        }
        else {
            retVal += arr[i].toString(16);
        }
    }
    return "0x" + retVal;
}

contract("GeonAgg & GeonCoin", accounts => {
    let geonAgg, geonCoin;

    async function verifyGeonDoesNotExist(geonId) {
        await assertReverts(geonAgg.getGeon(geonId), "Geon with this ID does not exist.");
    }
    
    beforeEach(async function() {
        geonCoin = await GeonCoin.new();
        geonAgg = await GeonAgg.new();
        let geonSto = await GeonSto.new();

        // GeonCoin/GeonAgg/GeonSto integration setup.
        await geonCoin.updateGeonTopupAddress(geonAgg.address);
        await geonAgg.updateRewardToken(geonCoin.address);
        await geonAgg.updateStorage(geonSto.address);
        await geonSto.addWhitelisted(geonAgg.address);
    });

    it("[GeonAgg] GeonAgg should not accept ETH", async () => {
        await assertReverts(geonAgg.send(1));
    });

    it("[GeonAgg] GeonAgg fallback function should revert", async () => {
        // Calling a non-existent function.
        await assertReverts(web3.eth.sendTransaction({ from: accounts[0], to: geonAgg.address, data: "0xe8cf31cb0000000000000000000000001234567890123456789012345678901234567890" }));

        // With value (also testing that the contract does not accept ETH).
        await assertReverts(web3.eth.sendTransaction({ from: accounts[0], to: geonAgg.address, data: "0xe8cf31cb0000000000000000000000001234567890123456789012345678901234567890", value: "1" }));
    });

    it("[GeonAgg] reward token address is initialized to 0", async () => {
        assert.strictEqual(DEFAULT_VALUE_ADDRESS, await (await GeonAgg.new()).rewardToken());
    });

    it("[GeonAgg] storage contract address is initialized to 0", async () => {
        assert.strictEqual(DEFAULT_VALUE_ADDRESS, await (await GeonAgg.new()).geonStorage());
    });

    it("[GeonAgg] reward token can be udpated only by the GeonAgg owner", async () => {
        // Ensure accounts[0] is the contract owner.
        assert.strictEqual(accounts[0], await geonAgg.owner());

        // Truffle usess accounts[0] by default.
        const rewardTokenAddress0 = "0x1234567890123456789012345678901234567890";
        await geonAgg.updateRewardToken(rewardTokenAddress0);
        assert.strictEqual(rewardTokenAddress0, await geonAgg.rewardToken());
        
        // Test it explicitly.
        const rewardTokenAddress1 = "0x0000000000000000000012345678901234567890";
        await geonAgg.updateRewardToken(rewardTokenAddress1, { from: accounts[0] });
        assert.strictEqual(rewardTokenAddress1, await geonAgg.rewardToken());
        
        // Negative case, using the wrong sender address.
        await assertReverts(geonAgg.updateRewardToken("0x1234567890123456789000000000000000000000", { from: accounts[1] }));
    });

    it("[GeonAgg] any sender can create a Geon", async () => {
        const geonId0 = "0x112233445566778899aabbccddeeff00";
        const geonId1 = "0x00ffeeddccbbaa998877665544332211";
        const sender0 = accounts[0];
        const sender1 = accounts[1];

        // Ensure Geons with these IDs don't exist.
        verifyGeonDoesNotExist(geonId0);
        verifyGeonDoesNotExist(geonId1);
        
        // Create using owner account.
        await geonAgg.createGeon(geonId0, { from: sender0 });
        geon = await geonAgg.getGeon(geonId0);
        verifyGeon({
            expectedGeonId: geonId0,
            expectedCreator: sender0,
            expectedRewardTokenOwned: "0",
            actualGeon: geon
        });

        // Create using another account.
        await geonAgg.createGeon(geonId1, { from: sender1 });
        geon = await geonAgg.getGeon(geonId1);
        verifyGeon({
            expectedGeonId: geonId1,
            expectedCreator: sender1,
            expectedRewardTokenOwned: "0",
            actualGeon: geon
        });
    });

    it("[GeonAgg] Geon with this ID already exists", async () => {
        const geonId0 = "0x112233445566778899aabbccddeeff00";
        const sender0 = accounts[0];
        const sender1 = accounts[1];

        // Ensure the Geon doesn't exist.
        verifyGeonDoesNotExist(geonId0);

        // Create using owner account.
        await geonAgg.createGeon(geonId0, { from: sender0 });
        geon = await geonAgg.getGeon(geonId0);
        verifyGeon({
            expectedGeonId: geonId0,
            expectedCreator: sender0,
            expectedRewardTokenOwned: "0",
            actualGeon: geon
        });

        // Create Geon with the same ID from another account.
        await assertReverts(geonAgg.createGeon(geonId0, { from: sender1 }), "Geon with this ID already exists.");
    });

    it("[GeonAgg] Geon count", async () => {
        const geonId0 = "0x112233445566778899aabbccddeeff00";
        const geonId1 = "0x00ffeeddccbbaa998877665544332211";
        const creator0 = accounts[0];
        const creator1 = accounts[1];

        let actualCount = await geonAgg.geonCount();
        assertBNEqual(actualCount, "0", `Geon count is ${actualCount}, but should be 0 initially.`);

        await geonAgg.createGeon(geonId0, { from: creator0 });
        actualCount = await geonAgg.geonCount();
        assertBNEqual(actualCount, "1", `Geon count is ${actualCount}, but should be 1 after 1 Geon is added`);

        await geonAgg.createGeon(geonId1, { from: creator1 });
        actualCount = await geonAgg.geonCount();
        assertBNEqual(actualCount, "2", `Geon count is ${actualCount}, but should be 2 after 2 Geons are added`);

        await geonAgg.deleteGeon(geonId0, { from: creator0 });
        actualCount = await geonAgg.geonCount();
        assertBNEqual(actualCount, "1", `Geon count is ${actualCount}, but should be 1 after 1 Geon is deleted`);

        await geonAgg.deleteGeon(geonId1, { from: creator1 });
        actualCount = await geonAgg.geonCount();
        assertBNEqual(actualCount, "0", `Geon count is ${actualCount}, but should be 0 after 2 Geons are deleted`);
    });

    it("[GeonAgg, GeonCoin] only the reward token contract can call GeonAgg.increaseGeonBalance()", async () => {
        const geonId = "0x112233445566778899aabbccddeeff00";
        const creator = accounts[0];
        const rewardToken = accounts[1];
        const amount = web3.utils.toWei("100", "ether");

        // Set the reward token address.
        await geonAgg.updateRewardToken(rewardToken);

        // Create a Geon.
        await geonAgg.createGeon(geonId, { from: creator });
        let geon = await geonAgg.getGeon(geonId);
        verifyGeon({
            expectedGeonId: geonId,
            expectedCreator: creator,
            expectedRewardTokenOwned: "0",
            actualGeon: geon
        });

        // Verify that sender other than the reward token contract cannot increase Geon balance.
        await assertReverts(geonAgg.increaseGeonBalance(geonId, amount, { from: creator }), "Can only be called by the reward token contract.");

        // Verify the reward token balance.
        geon = await geonAgg.getGeon(geonId);
        verifyGeon({
            expectedGeonId: geonId,
            expectedCreator: creator,
            expectedRewardTokenOwned: "0",
            actualGeon: geon
        });

        // Verify that the reward token contract can increase Geon balance.
        await geonAgg.increaseGeonBalance(geonId, amount, { from: rewardToken });

        // Verify the reward token balance.
        geon = await geonAgg.getGeon(geonId);
        verifyGeon({
            expectedGeonId: geonId,
            expectedCreator: creator,
            expectedRewardTokenOwned: amount,
            actualGeon: geon
        });
    });

    it("[GeonAgg] cannot increase balance of a non-existent Geon", async () => {
        const geonId = "0x11001100110011001100110011001100";
        const sender = accounts[0];
        const amount = web3.utils.toWei("100", "ether");

        // Ensure the Geon doesn't exist.
        verifyGeonDoesNotExist(geonId);

        // Set the reward token address to the sender.
        await geonAgg.updateRewardToken(sender);

        // Verify that the call fails with correct error message.
        await assertReverts(geonAgg.increaseGeonBalance(geonId, amount, { from: sender }), "Geon with this ID does not exist.");

        // Verify the Geon still doesn't exist.
        verifyGeonDoesNotExist(geonId);
    });

    it("[GeonCoin] Geon creator can top up a Geon", async () => {
        const geonId = "0x112233445566778899aabbccddeeff00";
        const creator = accounts[1];
        const amount = web3.utils.toWei("100", "ether");

        // Create a Geon.
        await geonAgg.createGeon(geonId, { from: creator });
        let geon = await geonAgg.getGeon(geonId);
        verifyGeon({
            expectedGeonId: geonId,
            expectedCreator: creator,
            expectedRewardTokenOwned: "0",
            actualGeon: geon
        });

        // Provision GeonCoins for user.
        await geonCoin.mint(creator, amount);

        // Top up the Geon.
        // TODO: Figure out how we can check that the tx result is true.
        await geonCoin.transferToGeon(geonId, amount, { from: creator });

        // Verify the amount allocated for the Geon in the GeonAgg.
        geon = await geonAgg.getGeon(geonId);
        verifyGeon({
            expectedGeonId: geonId,
            expectedCreator: creator,
            expectedRewardTokenOwned: amount,
            actualGeon: geon
        });

        // Verify creator GeonCoin balance.
        assertBNEqual(await geonCoin.balanceOf(creator), "0", "Creator GeonCoin balance");

        // Verify GeonAgg GeonCoin balance.
        assertBNEqual(await geonCoin.balanceOf(geonAgg.address), amount, "GeonAgg GeonCoin balance");
    });

    it("[GeonCoin] any user can top up a Geon", async () => {
        const geonId = "0x112233445566778899aabbccddeeff00";
        const creator = accounts[1];
        const sponsor = accounts[2];
        const initialAmount = new BN(web3.utils.toWei("56.789", "ether"));
        const topupAmount = new BN(web3.utils.toWei("12.34", "ether"));

        // Create a Geon.
        await geonAgg.createGeon(geonId, { from: creator });
        let geon = await geonAgg.getGeon(geonId);
        verifyGeon({
            expectedGeonId: geonId,
            expectedCreator: creator,
            expectedRewardTokenOwned: "0",
            actualGeon: geon
        });

        // Provision GeonCoins for users.
        await geonCoin.mint(sponsor, initialAmount);

        // Top up the Geon.
        await geonCoin.transferToGeon(geonId, topupAmount, { from: sponsor });

        // Verify the amount allocated for the Geon in the GeonAgg.
        geon = await geonAgg.getGeon(geonId);
        verifyGeon({
            expectedGeonId: geonId,
            expectedCreator: creator,
            expectedRewardTokenOwned: topupAmount,
            actualGeon: geon
        });

        // Verify GeonCoin balances.
        assertBNEqual(await geonCoin.balanceOf(creator), "0", "Creator GeonCoin balance");
        assertBNEqual(await geonCoin.balanceOf(sponsor), initialAmount.sub(topupAmount), "Sponsor GeonCoin balance");
        assertBNEqual(await geonCoin.balanceOf(geonAgg.address), topupAmount, "GeonAgg GeonCoin balance");
    });

    it("[GeonAgg] only Geon creator can delete the Geon and get reward tokens stored in it", async () => {
        const geonWithoutCoins = "0x01010101010101010101010101010101"; // Geon with 0 GeonCoins.
        const geonWithCoins = "0x02020202020202020202020202020202"; // Geon with >0 GeonCoins.
        const creator = accounts[1];
        const sponsor = accounts[2];
        const creatorInitialAmount = new BN(web3.utils.toWei("123.456", "ether"));
        const sponsorInitialAmount = new BN(web3.utils.toWei("789.012", "ether"));
        const topupAmount = new BN(web3.utils.toWei("12.3456", "ether"));

        // Provision GeonCoins for users.
        await geonCoin.mint(creator, creatorInitialAmount);
        await geonCoin.mint(sponsor, sponsorInitialAmount);

        // Ensure the Geons don't exist.
        verifyGeonDoesNotExist(geonWithoutCoins);
        verifyGeonDoesNotExist(geonWithCoins);

        // Create the Geons.
        await geonAgg.createGeon(geonWithoutCoins, { from: creator });
        geon = await geonAgg.getGeon(geonWithoutCoins);
        verifyGeon({
            expectedGeonId: geonWithoutCoins,
            expectedCreator: creator,
            expectedRewardTokenOwned: "0",
            actualGeon: geon
        });

        await geonAgg.createGeon(geonWithCoins, { from: creator });
        geon = await geonAgg.getGeon(geonWithoutCoins);
        verifyGeon({
            expectedGeonId: geonWithoutCoins,
            expectedCreator: creator,
            expectedRewardTokenOwned: "0",
            actualGeon: geon
        });

        // Top up one Geon.
        await geonCoin.transferToGeon(geonWithCoins, topupAmount, { from: sponsor });
        geon = await geonAgg.getGeon(geonWithCoins);
        verifyGeon({
            expectedGeonId: geonWithCoins,
            expectedCreator: creator,
            expectedRewardTokenOwned: topupAmount,
            actualGeon: geon
        });

        // Verify GeonCoin balances.
        assertBNEqual(await geonCoin.balanceOf(creator), creatorInitialAmount, "Creator GeonCoin balance before");
        assertBNEqual(await geonCoin.balanceOf(sponsor), sponsorInitialAmount.sub(topupAmount), "Sponsor GeonCoin balance before");
        assertBNEqual(await geonCoin.balanceOf(geonAgg.address), topupAmount, "GeonAgg GeonCoin balance before");

        // Verify that a sender who didn't create the Geon cannot delete it.
        await assertReverts(geonAgg.deleteGeon(geonWithoutCoins, { from: sponsor }), "Can only be called by the Geon creator.");
        await assertReverts(geonAgg.deleteGeon(geonWithCoins, { from: sponsor }), "Can only be called by the Geon creator.");

        // Verify that the Geons still exist.
        geon = await geonAgg.getGeon(geonWithoutCoins);
        verifyGeon({
            expectedGeonId: geonWithoutCoins,
            expectedCreator: creator,
            expectedRewardTokenOwned: "0",
            actualGeon: geon
        });

        geon = await geonAgg.getGeon(geonWithCoins);
        verifyGeon({
            expectedGeonId: geonWithCoins,
            expectedCreator: creator,
            expectedRewardTokenOwned: topupAmount,
            actualGeon: geon
        });

        // Verify that the creator can delete the Geons.
        await geonAgg.deleteGeon(geonWithoutCoins, { from: creator });
        await geonAgg.deleteGeon(geonWithCoins, { from: creator });

        // Verify the Geons do not exist.
        verifyGeonDoesNotExist(geonWithoutCoins);
        verifyGeonDoesNotExist(geonWithCoins);
        
        // Verify GeonCoin balances.
        assertBNEqual(await geonCoin.balanceOf(creator), creatorInitialAmount.add(topupAmount), "Creator GeonCoin balance after");
        assertBNEqual(await geonCoin.balanceOf(sponsor), sponsorInitialAmount.sub(topupAmount), "Sponsor GeonCoin balance after");
        assertBNEqual(await geonCoin.balanceOf(geonAgg.address), "0", "GeonAgg GeonCoin balance after");
    });

    it("[GeonAgg] cannot delete a non-existent Geon", async () => {
        const geonId0 = "0x112233445566778899aabbccddeeff00";
        const geonId1 = "0x00ffeeddccbbaa998877665544332211";
        const geonIdNonExistent = "0x01010101010101010101010101010101";
        const creator = accounts[0];
        const creatorInitialAmount = new BN(web3.utils.toWei("123.456", "ether"));
        const topupAmount = new BN(web3.utils.toWei("12.3456", "ether"));

        // Create dummy Geons to bump up the Geon count.
        await geonAgg.createGeon(geonId0, { from: creator });
        await geonAgg.createGeon(geonId1, { from: creator });

        // Give the creator some GeonCoins and top up.
        await geonCoin.mint(creator, creatorInitialAmount);
        await geonCoin.transferToGeon(geonId0, topupAmount, { from: creator });

        // Get initial Geon count and balance.
        const initialGeonCount = await geonAgg.geonCount();
        const initialGeonCoinBalance = await geonCoin.balanceOf(geonAgg.address);

        // Verify the initial Geon count and balance.
        assertBNEqual(initialGeonCount, "2", "Geon count should be 2 after 2 Geons are added")
        assertBNEqual(initialGeonCoinBalance, topupAmount, "GeonAgg GeonCoin balance before");
        assertBNEqual(await geonCoin.balanceOf(creator), creatorInitialAmount.sub(topupAmount), "Creator GeonCoin balance before");

        // Ensure the Geon doesn't exist.
        verifyGeonDoesNotExist(geonIdNonExistent);

        // Verify that delete fails.
        await assertReverts(geonAgg.deleteGeon(geonIdNonExistent, { from: creator }), "Geon with this ID does not exist.");

        // Verify the count and balance hasn't changed.
        assertBNEqual(await geonAgg.geonCount(), initialGeonCount, "Deleting non-existent Geon modified Geon count")
        assertBNEqual(await geonCoin.balanceOf(geonAgg.address), initialGeonCoinBalance, "GeonAgg GeonCoin balance after");
        assertBNEqual(await geonCoin.balanceOf(creator), creatorInitialAmount.sub(topupAmount), "Creator GeonCoin balance after");
    });

    it("[GeonCoin] cannot top up a non-existent Geon", async () => {
        const geonId = "0x01010101010101010101010101010101";
        const sponsor = accounts[0];
        const sponsorInitialAmount = web3.utils.toWei("789.012", "ether");
        const topupAmount = web3.utils.toWei("12.3456", "ether");

        // Give the sponsor some GeonCoins.
        await geonCoin.mint(sponsor, sponsorInitialAmount);
        
        // Ensure the Geon doesn't exist.
        verifyGeonDoesNotExist(geonId);

        // Verify the top up fails.
        await assertReverts(geonCoin.transferToGeon(geonId, topupAmount, { from: sponsor }), "Geon with this ID does not exist.");

        // Verify GeonCoin balances.
        assertBNEqual(await geonCoin.balanceOf(sponsor), sponsorInitialAmount, "Sponsor GeonCoin balance after");
        assertBNEqual(await geonCoin.balanceOf(geonAgg.address), "0", "GeonAgg GeonCoin balance after");
    });

    it("[GeonAgg] only GeonAgg owner can set geomining reward", async () => {
        const geonId = "0x01010101010101010101010101010101";
        const reqId = "0x02020202020202020202020202020202";
        const geonAggOwner = accounts[0];
        const sender = accounts[1];
        const geominer = accounts[2];
        let initialReward = "0";
        let newReward = "1";

        // Create Geon.
        await geonAgg.createGeon(geonId, { from: sender });
        geon = await geonAgg.getGeon(geonId);
        verifyGeon({
            expectedGeonId: geonId,
            expectedCreator: sender,
            expectedRewardTokenOwned: "0",
            actualGeon: geon
        });

        // Verify that sender different than the GeonAgg owner cannot set geomining reward.
        await assertReverts(geonAgg.setGeominingReward(geonId, geominer, reqId, newReward, { from: sender }));

        // Verify the geomining reward hasn't changed.
        geon = await geonAgg.getGeon(geonId);
        verifyGeon({
            expectedGeonId: geonId,
            expectedCreator: sender,
            expectedRewardTokenOwned: "0",
            actualGeon: geon
        });
        let actualReward = await geonAgg.getGeominingReward(geonId, geominer, reqId, { from: geominer });
        assertBNEqual(actualReward, initialReward, "Geomining reward before: actual " + actualReward + " expected " + initialReward);

        // Verify that the GeonAgg owner can set geomining reward.
        await geonAgg.setGeominingReward(geonId, geominer, reqId, newReward, { from: geonAggOwner });

        // Verify reward.
        geon = await geonAgg.getGeon(geonId);
        verifyGeon({
            expectedGeonId: geonId,
            expectedCreator: sender,
            expectedRewardTokenOwned: "0",
            actualGeon: geon
        });
        actualReward = await geonAgg.getGeominingReward(geonId, geominer, reqId, { from: geominer });
        assertBNEqual(actualReward, newReward, "Geomining reward after: actual " + actualReward + " expected " + newReward);
    });

    it("[GeonAgg] cannot set geomining reward on a non-existent Geon", async () => {
        const geonId = "0x01010101010101010101010101010101";
        const reqId = "0x02020202020202020202020202020202";
        const geonAggOwner = accounts[0];
        const geominer = accounts[2];
        let newReward = "1";

        // Ensure the Geon doesn't exist.
        verifyGeonDoesNotExist(geonId);

        // Verify that the GeonAgg owner can't set geomining reward.
        await assertReverts(geonAgg.setGeominingReward(geonId, geominer, reqId, newReward, { from: geonAggOwner }), "Geon with this ID does not exist.");

        // Ensure the Geon doesn't exist.
        verifyGeonDoesNotExist(geonId);
    });

    it("[GeonAgg] any account can geomine", async () => {
        const geonId = "0x01010101010101010101010101010101";
        const geonAggOwner = accounts[0];
        const creator = accounts[1];
        const geominer = accounts[2];
        const creatorReqId = "0x02020202020202020202020202020202";
        const geominerReqId = "0x03030303030303030303030303030303";
        let initalCreatorBalance = new BN(web3.utils.toWei("123.456", "ether"));
        let topupAmount = new BN(web3.utils.toWei("45.6789", "ether"));
        let creatorReward = new BN(web3.utils.toWei("12.3456", "ether"));
        let geominerReward = new BN(web3.utils.toWei("23.4567", "ether"));

        // Provision GeonCoins for creator.
        await geonCoin.mint(creator, initalCreatorBalance);

        // Create Geon.
        await geonAgg.createGeon(geonId, { from: creator });

        // Top it up.
        await geonCoin.transferToGeon(geonId, topupAmount, { from: creator });

        // Set geomining rewards.
        await geonAgg.setGeominingReward(geonId, creator, creatorReqId, creatorReward, { from: geonAggOwner });
        await geonAgg.setGeominingReward(geonId, geominer, geominerReqId, geominerReward, { from: geonAggOwner });

        // Geomine.
        await geonAgg.geomine(geonId, creatorReqId, { from: creator });
        await geonAgg.geomine(geonId, geominerReqId, { from: geominer });

        // Verify balances.
        let actual =  new BN(await geonCoin.balanceOf(creator));
        let expected = initalCreatorBalance.sub(topupAmount).add(creatorReward);
        assertBNEqual(actual, expected, `Creator GeonCoin balance after: actual ${web3.utils.fromWei(actual)} expected ${web3.utils.fromWei(expected)}`);

        actual = new BN(await geonCoin.balanceOf(geominer));
        expected = geominerReward;
        assert(actual, expected, `Geominer GeonCoin balance after: actual ${web3.utils.fromWei(actual)} expected ${web3.utils.fromWei(expected)}`);
        
        actual = new BN(await geonCoin.balanceOf(geonAgg.address));
        expected = topupAmount.sub(creatorReward).sub(geominerReward);
        assert(actual, expected, `GeonAgg GeonCoin balance after: actual ${web3.utils.fromWei(actual)} expected ${web3.utils.fromWei(expected)}`);
    });

    it("[GeonAgg] geomining more than the Geon balance fails", async () => {
        const geonId = "0x01010101010101010101010101010101";
        const geonAggOwner = accounts[0];
        const creator = accounts[1];
        const geominer = accounts[2];
        const geominerReqId = "0x03030303030303030303030303030303";
        let initalCreatorBalance = new BN(web3.utils.toWei("123.456", "ether"));
        let topupAmount = new BN(web3.utils.toWei("45.6789", "ether"));
        let geominerReward = new BN(web3.utils.toWei("1123.4567", "ether"));

        // Provision GeonCoins for creator.
        await geonCoin.mint(creator, initalCreatorBalance);

        // Create Geon.
        await geonAgg.createGeon(geonId, { from: creator });

        // Top it up.
        await geonCoin.transferToGeon(geonId, topupAmount, { from: creator });

        // Set geomining rewards.
        await geonAgg.setGeominingReward(geonId, geominer, geominerReqId, geominerReward, { from: geonAggOwner });

        // Verify that geomining fails.
        await assertReverts(geonAgg.geomine(geonId, geominerReqId, { from: geominer }));

        // Verify balances.
        let actual =  new BN(await geonCoin.balanceOf(creator));
        let expected = initalCreatorBalance.sub(topupAmount);
        assertBNEqual(actual, expected, `Creator GeonCoin balance after: actual ${web3.utils.fromWei(actual)} expected ${web3.utils.fromWei(expected)}`);

        actual = new BN(await geonCoin.balanceOf(geominer));
        expected = new BN("0");
        assertBNEqual(actual, expected, `Geominer GeonCoin balance after: actual ${web3.utils.fromWei(actual)} expected ${web3.utils.fromWei(expected)}`);
        
        actual = new BN(await geonCoin.balanceOf(geonAgg.address));
        expected = topupAmount;
        assertBNEqual(actual, expected, `GeonAgg GeonCoin balance after: actual ${web3.utils.fromWei(actual)} expected ${web3.utils.fromWei(expected)}`);
    });

    it("[GeonAgg] batch Geon create", async () => {
        let geonIds = [];
        let creator = accounts[1];
        const expectedGeonCount = 98;

        for (let i = 0; i < expectedGeonCount; i++) {
            let bytes16 = new Uint8Array(16);
            bytes16[0] = i;

            // Set the remaining bytes to their index.
            for (let j = 1; j < 16; j++) {
                bytes16[j] = j;
            }

            geonIds.push(byteArrayToHexString(bytes16));
        }

        let actualGeonCount = await geonAgg.geonCount();
        assertBNEqual(actualGeonCount, "0", `Geon count is ${actualGeonCount}, but should be 0 initially.`);

        await geonAgg.createGeons(geonIds, { from: creator });

        actualGeonCount = await geonAgg.geonCount();
        assertBNEqual(actualGeonCount, expectedGeonCount, `Geon count is ${actualGeonCount}, but should be ${expectedGeonCount} after batch create operation.`);

        for (let i = 0; i < geonIds.length; i++) {
            let geon = await geonAgg.getGeon(geonIds[i]);
            verifyGeon({
                expectedGeonId: geonIds[i],
                expectedCreator: creator,
                expectedRewardTokenOwned: "0",
                actualGeon: geon
            });
        }
    });

    it("[GeonCoin] batch Geon top up", async () => {
        let geonIds = [];
        let creator = accounts[1];
        const expectedGeonCount = 98;
        let runningSum = new BN("0");

        // Prep token amounts.
        let amounts = [];
        for (let i = 0; i < expectedGeonCount; i++) {
            const amountStr = i + "." + i;
            const amountBN = new BN(web3.utils.toWei(amountStr, "ether"));
            amounts[i] = amountBN;
            runningSum = runningSum.add(amountBN);
        }

        // Mint tokens to the creator.
        const expectedTotalAmount = runningSum;
        await geonCoin.mint(creator, expectedTotalAmount);

        // Prep Geon IDs.
        for (let i = 0; i < expectedGeonCount; i++) {
            let bytes16 = new Uint8Array(16);
            bytes16[0] = i;

            // Set the remaining bytes to their index.
            for (let j = 1; j < 16; j++) {
                bytes16[j] = j;
            }

            geonIds.push(byteArrayToHexString(bytes16));
        }

        // Initial state checks.
        assertBNEqual(await geonAgg.geonCount(), "0", "Geon count should be 0 initially.")
        assertBNEqual(await geonCoin.balanceOf(geonAgg.address), "0", "GeonAgg balance should be 0 initially.")
        
        let expected = expectedTotalAmount;
        let actual = new BN(await geonCoin.balanceOf(creator));
        assertBNEqual(actual, expected, `Creator balance before: actual ${web3.utils.fromWei(actual)} expected ${web3.utils.fromWei(expected)}`);

        // Create Geons.
        await geonAgg.createGeons(geonIds, { from: creator });

        // Transfer tokens to the Geons.
        await geonCoin.transferToGeons(geonIds, amounts, { from: creator });

        // Verify token amounts in Geons.
        for (let i = 0; i < geonIds.length; i++) {
            let geon = await geonAgg.getGeon(geonIds[i]);
            verifyGeon({
                expectedGeonId: geonIds[i],
                expectedCreator: creator,
                expectedRewardTokenOwned: amounts[i],
                actualGeon: geon
            });
        }

        // End state checks.
        actual = await geonAgg.geonCount();
        expected = new BN(expectedGeonCount);
        assertBNEqual(actual, expected, `Geon count is ${actual}, but should be ${expectedGeonCount} after batch create operation.`)
        
        actual = new BN(await geonCoin.balanceOf(creator));
        expected = new BN("0");
        assertBNEqual(actual, expected, `Creator balance after: actual ${web3.utils.fromWei(actual)} expected ${web3.utils.fromWei(expected)}`);
        
        actual = new BN(await geonCoin.balanceOf(geonAgg.address));
        expected = expectedTotalAmount;
        assertBNEqual(actual, expected, `GeonAgg balance after: actual ${web3.utils.fromWei(actual)} expected ${web3.utils.fromWei(expected)}`);
    });
});