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

setInterval(async () => {
    if (mirroring === true) {
        console.log('currently mirroring');
        return;
    }
    
    console.log('importing live blocks');

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
}, 30000);
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

    for (const block of blocks) {
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
    
        const resultString = await graphqlActor.graphql_mutation(mutation, '{}') as string;
        const resultJSON = JSON.parse(resultString);
        
        checkResultForErrors(resultJSON);
    }
}

async function deleteBlocks(): Promise<void> {
    const latestMirroredBlockNumber = await getLatestMirroredBlockNumber();
    const firstMirroredBlockNumber = await getFirstMirroredBlockNumber();

    const numMirroredBlocks = latestMirroredBlockNumber - firstMirroredBlockNumber + 1;

    const totalAllowedBlocks = 1100;
    const deleteBatchSize = 100;

    if (numMirroredBlocks <= totalAllowedBlocks) {
        return;
    }

    const blocksToDelete = await getBlocksToDelete(
        firstMirroredBlockNumber,
        firstMirroredBlockNumber + deleteBatchSize
    );

    const blockIdsToDelete = blocksToDelete.map((block) => {
        return `"${block.id}"`;
    });

    const transactionIdsToDelete = blocksToDelete.reduce((result: ReadonlyArray<string>, block) => {
        return [
            ...result,
            ...block.transactions.map((transaction) => `"${transaction.id}"`)
        ];
    }, []);

    // TODO we should disconnect the parent blocks as well
    const mutation = `
        mutation {
            deleteTransaction(input: {
                ids: [${transactionIdsToDelete.join(',')}]
            }) {
                id
            }

            deleteBlock(input: {
                ids: [${blockIdsToDelete.join(',')}]
            }) {
                id
            }
        }
    `;

    const graphqlActor = await getGraphQLActor();

    const resultString = await graphqlActor.graphql_mutation(mutation, '{}') as string;

    const resultJSON = JSON.parse(resultString);

    checkResultForErrors(resultJSON);
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
                    lte: ${lastBlockNumber}
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