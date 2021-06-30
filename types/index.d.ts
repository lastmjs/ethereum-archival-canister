export type GethBlock = Readonly<{
    number: number;
    hash: string;
    parent: GethBlock;
    transactionsRoot: string;
    transactionCount: number | null;
    stateRoot: string;
    gasLimit: string;
    gasUsed: string;
    timestamp: number;
    transactions: ReadonlyArray<GethTransaction>;
}>;

type GethTransaction = Readonly<{
    hash: string;
    index: number;
    from: GethAccount;
    to: GethAccount;
    value: string;
    gasPrice: string;
    gas: number;
    inputData: string;
    block: GethBlock | null;
    gasUsed: number | null;
}>;

type GethAccount = {
    address: string;
    balance: number;
    transactionCount: number;
    code: string;
    storage: string;
}

type BlockToDelete = {
    id: string;
    number: number;
    transactions: ReadonlyArray<TransactionToDelete>;
};

type TransactionToDelete = {
    id: string;
    hash: string;
};