import { Ed25519KeyIdentity } from '@dfinity/identity';

const identity = Ed25519KeyIdentity.generate(require('crypto').randomBytes(32));

console.log(JSON.stringify(identity.toJSON(), null, 2));