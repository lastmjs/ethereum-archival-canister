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
        const fileStream = fs.createReadStream('ethereum-etl/blocks-test.json');

        fileStream.on('error', (error) => {
            console.log(error);
        });
    
        const readlineInterface = readline.createInterface({
            input: fileStream
        });
    
        const graphqlActor = await getGraphQLActor();
    
        console.log('about to rad lines');
    
        const lines = await getLines(
            readlineInterface,
            10
        );
    
        console.log('rad lines');
    
        console.log(lines);
        console.log(lines.length);
    
        // // TODO this does one line at a time, we will want to do many lines at a time
        // for await (const line of readlineInterface) {
        //     const block = JSON.parse(line);
    
        //     const startTime = new Date().getTime();
        //     console.log(`Saving block ${block.number}`);
        
        //     await graphqlActor.graphql_mutation(`
        //         mutation (
        //             $number: Int!
        //             $hash: String!
        //             $parentHash: String!
        //         ) {
        //             createBlock(input: {
        //                 number: $number
        //                 hash: $hash
        //                 parentHash: $parentHash
        //             }) {
        //                 id
        //             }
        //         }
        //     `, JSON.stringify({
        //         number: block.number,
        //         hash: block.hash,
        //         parentHash: block.parent_hash
        //     }));
    
        //     const endTime = new Date().getTime();
        //     console.log(`Saved block ${block.number} in ${(endTime - startTime) / 1000} seconds`);
        // }
    }
    catch(error) {
        console.log(error);
    }
}

async function getLines(
    readlineInterface: readline.Interface,
    numLines: number
): Promise<ReadonlyArray<string>> {
    console.log('getLines');
    let index = 0;
    let lines: Array<string> = [];

    console.log('starting to iterate');
    console.log('index', index);
    console.log('numLines', numLines);
    for await (const line of readlineInterface) {
        console.log('iterating', line);
        if (index === numLines) {
            return lines;
        }

        index += 1;
        lines.push(line);
    }
    console.log('finished iterating');

    return lines;
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