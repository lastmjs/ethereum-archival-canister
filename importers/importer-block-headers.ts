import * as fs from 'fs';
import * as readline from 'readline';
import {
    Actor,
    HttpAgent
} from '@dfinity/agent';

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

// import * as fetch from 'node-fetch'; // TODO types were messed up, commenting out for convenience
const fetch = require('node-fetch');

type Block = Readonly<{
    number: number;
    hash: string;
    parent_hash: string;
}>;

importBlockHeaders();

async function importBlockHeaders() {
    try {
        const numLines = await getNumLines('ethereum-etl/blocks-0-1000000/blocks.json');
        const batchSize = 10000;

        for (let i=0; i < numLines; i += batchSize) {
            console.log(`creating batch mutation for blocks ${i} - ${i + batchSize - 1}`);

            const batchMutation = await getBatchMutation(
                i,
                batchSize
            );
            
            const graphqlActor = await getGraphQLActor();
    
            const startTime = new Date().getTime();
            console.log(`Saving blocks ${i} - ${i + batchSize - 1}`);
    
            await graphqlActor.graphql_mutation(
                batchMutation,
                JSON.stringify({})
            );
    
            const endTime = new Date().getTime();
            console.log(`Saved blocks ${i} - ${i + batchSize - 1} in ${(endTime - startTime) / 1000} seconds`);
        }
    }
    catch(error) {
        console.log(error);
    }
}

async function getBatchMutation(
    startLineNumber: number,
    numLines: number
): Promise<string> {
    const lines = await getLines(
        startLineNumber,
        numLines
    );

    const blocks = convertLinesIntoBlocks(lines);
    const mutations = convertBlocksIntoMutations(blocks);

    return `
        mutation {
            ${mutations.join('\n')}
        }
    `;
}

function convertBlocksIntoMutations(blocks: ReadonlyArray<Block>): ReadonlyArray<string> {
    return blocks.map((block: Block) => {
        return convertBlockIntoMutation(block);
    });
}

function convertBlockIntoMutation(block: Block): string {
    return `
        createBlock${block.number}: createBlock(input: {
            number: ${block.number}
            hash: "${block.hash}"
            parentHash: "${block.parent_hash}"
        }) {
            id
        }
    `;
}

// TODO these mutations are kind of gross, but this seems the best way to consume a stream with async/await
async function getLines(
    startLineNumber: number,
    numLines: number
): Promise<ReadonlyArray<string>> {
    let fastForwardIndex = 0;
    let index = 0;
    let lines: Array<string> = [];

    const fileStream = fs.createReadStream('ethereum-etl/blocks-0-1000000/blocks.json');
    
    const readlineInterface = readline.createInterface({
        input: fileStream
    });

    for await (const line of readlineInterface) {
        if (fastForwardIndex < startLineNumber) {
            fastForwardIndex += 1;
            continue;
        }

        if (index === numLines) {
            return lines;
        }

        index += 1;
        lines.push(line);
    }

    return lines;
}

async function getNumLines(
    filename: string
): Promise<number> {
    const fileStream = fs.createReadStream(filename);
    
    const readlineInterface = readline.createInterface({
        input: fileStream
    });

    let index = 0;

    for await (const line of readlineInterface) {
        index += 1;
    }

    return index;
}

function convertLinesIntoBlocks(lines: ReadonlyArray<string>): ReadonlyArray<Block> {
    return lines.map((line: string) => {
        return convertLineIntoBlock(line);
    });
}

function convertLineIntoBlock(line: string): Block {
    return JSON.parse(line);
}

async function getGraphQLActor() {
    const idlFactory = ({ IDL }: { IDL: any }) => {
        return IDL.Service({
            graphql_query: IDL.Func([IDL.Text, IDL.Text], [IDL.Text], ['query']),
            graphql_mutation: IDL.Func([IDL.Text, IDL.Text], [IDL.Text], [])
        });
    };

    const agent = new HttpAgent({
        fetch,
        host: 'http://localhost:8000'
    });
    await agent.fetchRootKey(); // TODO this should be removed in production
    const graphqlActor = Actor.createActor(idlFactory, {
        agent,
        canisterId: 'ryjl3-tyaaa-aaaaa-aaaba-cai'
    });

    return graphqlActor;
}