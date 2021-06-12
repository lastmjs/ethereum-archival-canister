import {
    getNumLines,
    getGraphQLActor,
    getLines
} from './utilities';

// import {
//     sudograph,
//     gql
// } from 'sudograph';

// const {
//     mutation
// } = sudograph({
//     canisterId: 'ryjl3-tyaaa-aaaaa-aaaba-cai'
// });
// TODO we can use Sudograph client directly once I add a cjs build

type Block = Readonly<{
    number: number;
    hash: string;
    parent_hash: string;
    transactions_root: string;
    transaction_count: number;
    state_root: string;
    gas_limit: number;
    gas_used: number;
    timestamp: number;
}>;

importBlockHeaders();

// TODO let's also import transactions baby!
// TODO I am thinking that we can start with the first 100,000 blocks with their transactions and see how we're doing
async function importBlockHeaders() {
    try {
        const filename = 'ethereum-etl/blocks-0-1000000/blocks.json';
        const numLines = await getNumLines(filename);
        // const startingBlock = 100000;
        const startingBlock = 0;
        const batchSize = 1000;

        for (let i=startingBlock; i < numLines; i += batchSize) {
            // if (i > 100000) {
            //     return;
            // }

            console.log(`creating batch mutation for blocks ${i} - ${i + batchSize - 1}`);

            const batchMutation = await getBatchMutation(
                filename,
                i,
                batchSize
            );

            // console.log(batchMutation)
            
            const graphqlActor = await getGraphQLActor();
    
            const startTime = new Date().getTime();
            console.log(`Saving blocks ${i} - ${i + batchSize - 1}`);
    
            const result: any = await graphqlActor.graphql_mutation(
                batchMutation,
                JSON.stringify({})
            );

            // console.log(result);

            // TODO add better error handling
            // if ((
            //     result.errors !== null &&
            //     result.errors !== undefined
            // ) &&
            //     result.errors.length !== 0
            // ) {
            //     throw new Error(result);
            // }
    
            const endTime = new Date().getTime();
            console.log(`Saved blocks ${i} - ${i + batchSize - 1} in ${(endTime - startTime) / 1000} seconds`);
        }
    }
    catch(error) {
        console.log(error);
    }
}

async function getBatchMutation(
    filename: string,
    startLineNumber: number,
    numLines: number
): Promise<string> {
    const lines = await getLines(
        filename,
        startLineNumber,
        numLines
    );

    const blocks = convertLinesIntoBlocks(lines);
    const mutations = await convertBlocksIntoMutations(blocks);

    return `
        mutation {
            ${mutations.join('\n')}
        }
    `;
}

function convertLinesIntoBlocks(lines: ReadonlyArray<string>): ReadonlyArray<Block> {
    return lines.map((line: string) => {
        return convertLineIntoBlock(line);
    });
}

function convertLineIntoBlock(line: string): Block {
    return JSON.parse(line);
}

async function convertBlocksIntoMutations(blocks: ReadonlyArray<Block>): Promise<ReadonlyArray<string>> {
    const promises = blocks.map(async (block: Block) => {
        return convertBlockIntoMutation(block);
    });

    return await Promise.all(promises);
}

async function convertBlockIntoMutation(block: Block): Promise<string> {
    const graphqlActor = await getGraphQLActor();

    const result: any = await graphqlActor.graphql_query(
        `
            query {
                readBlock(input: {
                    hash: {
                        eq: "${block.parent_hash}"
                    }
                }) {
                    id
                }
            }
        `,
        JSON.stringify({})
    );

    const resultJSON = JSON.parse(result);

    console.log('resultJSON', resultJSON);

    const parentBlockId = resultJSON.data?.readBlock[0]?.id ?? null;
    
    console.log('parentBlockId', parentBlockId);

    return `
        createBlock${block.number}: createBlock(input: {
            id: "${block.number}"
            number: ${block.number}
            hash: "${block.hash}"
            ${parentBlockId === null ? '' : `
                parent: {
                    connect: "${parentBlockId}"
                }
            `}
            transactionsRoot: "${block.transactions_root}"
            transactionCount: ${block.transaction_count}
            stateRoot: "${block.state_root}"
            gasLimit: "${block.gas_limit}"
            gasUsed: "${block.gas_used}"
            timestamp: "${new Date(block.timestamp * 1000).toISOString()}"
        }) {
            id
        }
    `;
}