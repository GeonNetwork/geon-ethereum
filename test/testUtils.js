const assertReverts = async (promise, expectedError) => {
    try {
        await promise;
    } catch (error) {
        if (error.message) {
            assert.include(error.message, "VM Exception while processing transaction: revert");
        }
        else {
            assert.fail("Exception does not include a message.")
        }

        if (expectedError) {
            assert.include(error.message, expectedError);
        }

        return;
    }

    assert.fail("Transaction did not revert.")
}

module.exports = {
    assertReverts
}