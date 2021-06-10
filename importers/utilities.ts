import * as fs from 'fs';
import * as readline from 'readline';
import {
    Actor,
    HttpAgent
} from '@dfinity/agent';

// import * as fetch from 'node-fetch'; // TODO types were messed up, commenting out for convenience
const fetch = require('node-fetch');

// TODO these mutations are kind of gross, but this seems the best way to consume a stream with async/await
export async function getLines(
    filename: string,
    startLineNumber: number,
    numLines: number
): Promise<ReadonlyArray<string>> {
    let fastForwardIndex = 0;
    let index = 0;
    let lines: Array<string> = [];

    const fileStream = fs.createReadStream(filename);
    
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

export async function getNumLines(
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

export async function getGraphQLActor() {
    const idlFactory = ({ IDL }: { IDL: any }) => {
        return IDL.Service({
            graphql_query: IDL.Func([IDL.Text, IDL.Text], [IDL.Text], ['query']),
            graphql_mutation: IDL.Func([IDL.Text, IDL.Text], [IDL.Text], [])
        });
    };

    const agent = new HttpAgent({
        fetch,
        // host: 'http://localhost:8000',
        host: 'https://ic0.app'
    });
    await agent.fetchRootKey(); // TODO this should be removed in production
    const graphqlActor = Actor.createActor(idlFactory, {
        agent,
        canisterId: 'imzdt-lyaaa-aaaae-qaaja-cai'
    });

    return graphqlActor;
}