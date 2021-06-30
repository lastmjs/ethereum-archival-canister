// TODO it should be pretty easy to build something like a gas station on top of this
// TODO or any kind of real-time statistics on Ethereum blocks
import {
    getGraphQLActor,
    checkResultForErrors
} from './utilities';
import {
    GethBlock,
    BlockToDelete
} from '../types/index.d';

const fetch = require('node-fetch');

let mirroring = false;
let currentlyMirroringTicks = 0;

setInterval(async () => {
    if (mirroring === true) {
        console.log('currently mirroring', new Date());
        console.log('currentlyMirroringTicks', currentlyMirroringTicks);
        currentlyMirroringTicks += 1;

        if (currentlyMirroringTicks >= 60) {
            require('child_process').exec('sudo reboot');
        }

        return;
    }
    
    console.log('importing live blocks');

    currentlyMirroringTicks = 0;
    mirroring = true;

    const latestMirroredBlockNumber = await getLatestMirroredBlockNumber();
    console.log('latestMirroredBlockNumber', latestMirroredBlockNumber);
    const fromBlock = latestMirroredBlockNumber === 0 ? await getLatestBlockNumber() : latestMirroredBlockNumber + 1;
    console.log('fromBlock', fromBlock);
    const blocksToMirror = await getBlocksToMirror(fromBlock);
    console.log('blocksToMirror.length', blocksToMirror.length);

    await mirrorBlocks(blocksToMirror);
    console.log('blocks mirrored');
    await deleteBlocks();
    console.log('blocks deleted');
    console.log();

    mirroring = false;
}, 1000);
// TODO consider block reorgs and such, I am not sure what to do in that case

async function getLatestMirroredBlockNumber(): Promise<number> {
    const graphqlActor = await getGraphQLActor();

    const resultString = await graphqlActor.graphql_query(`
        query {
            readBlock(limit: 1, order: {
                number: DESC
            }) {
                number
            }
        }
    `, '{}') as string;

    const resultJSON = JSON.parse(resultString);

    checkResultForErrors(resultJSON);

    return resultJSON.data.readBlock[0]?.number ?? 0;
}

async function getLatestBlockNumber(): Promise<number> {
    const response = await fetch('http://localhost:8545/graphql', {
        method: 'POST',
        body: JSON.stringify({
            query: `
                query {
                    block {
                        number
                    }
                }
            `
        })
    });

    const result = await response.json();

    checkResultForErrors(result);

    return result.data.block.number;
}

async function getBlocksToMirror(
    from: number
): Promise<ReadonlyArray<GethBlock>> {
    const response = await fetch('http://localhost:8545/graphql', {
        method: 'POST',
        body: JSON.stringify({
            query: `
                query {
                    blocks(from: ${from}) {
                        number
                        hash
                        parent {
                            number
                        }
                        transactionsRoot
                        transactionCount
                        stateRoot
                        gasLimit
                        gasUsed
                        timestamp
                        transactions {
                            hash
                            index
                            from {
                                address
                            }
                            to {
                                address
                            }
                            value
                            gasPrice
                            gas
                            inputData
                            gasUsed
                        }
                    }
                }
            `
        })
    });

    const result = await response.json();

    checkResultForErrors(result);

    return result.data.blocks;
}

async function mirrorBlocks(blocks: ReadonlyArray<GethBlock>): Promise<void> {
    if (blocks.length === 0) {
        return;
    }

    const promises = blocks.map(async (block) => {
        console.log('mirroring block', block.number);
        const mutation = `
            mutation {
                createBlock(input: {
                    id: "${block.number}"
                    number: ${block.number}
                    hash: "${block.hash}"
                    ${block.parent === null ? '' : `
                        parent: {
                            connect: "${block.parent.number}"
                        }
                    `}
                    transactionsRoot: "${block.transactionsRoot}"
                    ${block.transactionCount === null ? '' : `transactionCount: ${block.transactionCount}`}
                    stateRoot: "${block.stateRoot}"
                    gasLimit: "${block.gasLimit}"
                    gasUsed: "${block.gasUsed}"
                    timestamp: "${new Date(block.timestamp * 1000).toISOString()}"
                }) {
                    id
                }
    
                ${block.transactions.map((transaction) => {
                    return `
                        createTransaction${transaction.hash}: createTransaction(input: {
                            hash: "${transaction.hash}"
                            index: ${transaction.index}
                            from: "${transaction.from.address}"
                            ${transaction.to === null ? '' : `to: "${transaction.to.address}"`}
                            value: "${transaction.value}"
                            gasPrice: "${transaction.gasPrice}"
                            gas: "${transaction.gas}"
                            inputData: "${transaction.inputData}"
                            ${transaction.block === null ? '' : `
                                block: {
                                    connect: "${block.number}"
                                }
                            `}
                            ${transaction.gasUsed === null ? '' : `gasUsed: "${transaction.gasUsed}"`}
                        }) {
                            id
                        }
                    `;
                }).join('')}
            }
        `;
    
        const graphqlActor = await getGraphQLActor();
    
        const resultString = await graphqlActor.graphql_mutation_custom(mutation, '{}') as string;
        const resultJSON = JSON.parse(resultString);
        
        checkResultForErrors(resultJSON);
    
        console.log('mirrored block', block.number);
    });

    await Promise.all(promises);
}

async function deleteBlocks(): Promise<void> {
    const latestMirroredBlockNumber = await getLatestMirroredBlockNumber();
    const firstMirroredBlockNumber = await getFirstMirroredBlockNumber();

    const numMirroredBlocks = latestMirroredBlockNumber - firstMirroredBlockNumber + 1;

    // TODO this deletion batching system can be messed with to come up with an optimal solution
    // TODO Right now I just want the thing to work and be robust, so it is very simple
    // TODO but not optimizing for cycle usage
    const targetAllowedBlocks = 100000;
    const deleteBatchSize = 5;

    if (numMirroredBlocks < targetAllowedBlocks + deleteBatchSize) {
        return;
    }

    const blocksToDelete = await getBlocksToDelete(
        firstMirroredBlockNumber,
        firstMirroredBlockNumber + deleteBatchSize
    );

    const promises = blocksToDelete.map(async (blockToDelete) => {
        console.log('deleting block', blockToDelete.id);
        
        const transactionIdsToDelete = blockToDelete.transactions.map((transactionToDelete) => `"${transactionToDelete.id}"`);
        
        const mutation = `
            mutation {
                deleteTransaction(input: {
                    ids: [${transactionIdsToDelete.join(',')}]
                }) {
                    id
                }
    
                deleteBlock(input: {
                    id: "${blockToDelete.id}"
                }) {
                    id
                }
            }
        `;
    
        const graphqlActor = await getGraphQLActor();
    
        const resultString = await graphqlActor.graphql_mutation_custom(mutation, '{}') as string;
    
        const resultJSON = JSON.parse(resultString);
    
        checkResultForErrors(resultJSON);

        console.log('deleted block', blockToDelete.id);
    });

    await Promise.all(promises);
}

async function getFirstMirroredBlockNumber(): Promise<number> {
    const graphqlActor = await getGraphQLActor();

    const resultString = await graphqlActor.graphql_query(`
        query {
            readBlock(limit: 1, order: {
                number: ASC
            }) {
                number
            }
        }
    `, '{}') as string;

    const resultJSON = JSON.parse(resultString);

    checkResultForErrors(resultJSON);

    return resultJSON.data.readBlock[0]?.number ?? 0;    
}

async function getBlocksToDelete(
    firstBlockNumber: number,
    lastBlockNumber: number
): Promise<ReadonlyArray<BlockToDelete>> {
    const graphqlActor = await getGraphQLActor();

    const resultString = await graphqlActor.graphql_query(`
        query {
            readBlock(search: {
                number: {
                    gte: ${firstBlockNumber}
                    lt: ${lastBlockNumber}
                }
            }) {
                id
                number
                transactions {
                    id
                    hash
                }
            }
        }
    `, '{}') as string;

    const resultJSON = JSON.parse(resultString);

    checkResultForErrors(resultJSON);

    return resultJSON.data.readBlock;
}