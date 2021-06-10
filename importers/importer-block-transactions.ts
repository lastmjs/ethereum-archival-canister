import {
    getNumLines,
    getGraphQLActor,
    getLines
} from './utilities';

type Transaction = Readonly<{
    hash: string;
    transaction_index: number;
    from_address: string;
    to_address: string;
    value: string;
    gas_price: number;
    gas: number;
    input_data: string;
    block_number: number;
    gas_used: number;
}>;

importBlockTransactions();

async function importBlockTransactions() {
    const filename = 'ethereum-etl/blocks-0-1000000/transactions.json';
    const numLines = await getNumLines(filename);
    // const startingTransaction = 26971;
    const startingTransaction = 0;
    const batchSize = 1000;

    for (let i=startingTransaction; i < numLines; i += batchSize) {
        // if (i > 100000) {
        //     return;
        // }

        console.log(`creating batch mutation for transactions ${i} - ${i + batchSize - 1}`);

        const batchMutation = await getBatchMutation(
            filename,
            i,
            batchSize
        );
        
        const graphqlActor = await getGraphQLActor();

        const startTime = new Date().getTime();
        console.log(`Saving transactions ${i} - ${i + batchSize - 1}`);

        const result = await graphqlActor.graphql_mutation(
            batchMutation,
            JSON.stringify({})
        );

        console.log('result', result);

        const endTime = new Date().getTime();
        console.log(`Saved transactions ${i} - ${i + batchSize - 1} in ${(endTime - startTime) / 1000} seconds`);
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

    const transactions = convertLinesIntoTransactions(lines);
    const mutations = convertTransactionsIntoMutations(transactions);

    return `
        mutation {
            ${mutations.join('\n')}
        }
    `;
}

function convertLinesIntoTransactions(lines: ReadonlyArray<string>): ReadonlyArray<Transaction> {
    return lines.map((line: string) => {
        return convertLineIntoTransaction(line);
    });
}

function convertLineIntoTransaction(line: string): Transaction {
    return JSON.parse(line);
}

function convertTransactionsIntoMutations(transactions: ReadonlyArray<Transaction>): ReadonlyArray<string> {
    return transactions.map((transaction: Transaction) => {
        return convertTransactionIntoMutation(transaction);
    });
}

function convertTransactionIntoMutation(transaction: Transaction): string {
    return `
        createTransaction${transaction.hash}: createTransaction(input: {
            hash: "${transaction.hash}"
            index: ${transaction.transaction_index}
            from: "${transaction.from_address}"
            to: "${transaction.to_address}"
            value: "${transaction.value}"
            gasPrice: "${transaction.gas_price}"
            gas: "${transaction.gas}"
            inputData: "${transaction.input_data}"
            block: {
                connect: "${transaction.block_number}"
            }
            gasUsed: "${transaction.gas_used}"
        }) {
            id
        }
    `;
}