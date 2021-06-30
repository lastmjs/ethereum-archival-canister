import * as fs from 'fs';
import * as readline from 'readline';
import {
    Actor,
    HttpAgent
} from '@dfinity/agent';
import { Ed25519KeyIdentity } from '@dfinity/identity';

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

// TODO I would be using the sudograph client, but there are some node incompatibilities that I need to work out
export async function getGraphQLActor() {
    const idlFactory = ({ IDL }: { IDL: any }) => {
        return IDL.Service({
            graphql_query: IDL.Func([IDL.Text, IDL.Text], [IDL.Text], ['query']),
            graphql_mutation_custom: IDL.Func([IDL.Text, IDL.Text], [IDL.Text], [])
        });
    };

    const identityJSONString = require('fs').readFileSync('ec2/identity.json').toString();
    const identity = Ed25519KeyIdentity.fromJSON(identityJSONString);

    // TODO next I need to figure out auth so that only the EC2 instance can do mutations
    const agent = new HttpAgent({
        identity,
        fetch,
        host: process.env.HTTP_AGENT_HOST
    });
    await agent.fetchRootKey(); // TODO this should be removed in production
    const graphqlActor = Actor.createActor(idlFactory, {
        agent,
        canisterId: process.env.GRAPHQL_CANISTER_ID ?? ''
    });

    return graphqlActor;
}

// TODO eventually move to a Result system of some sort
export function checkResultForErrors(result: any) {
    if (
        result.errors !== null &&
        result.errors !== undefined &&
        result.errors.length > 0
    ) {
        throw new Error(JSON.stringify(result, null, 2));
    }
}