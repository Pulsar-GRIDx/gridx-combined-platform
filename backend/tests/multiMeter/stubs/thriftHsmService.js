// vending/thriftHsmService.js loads the thrift library, which pulls in an
// ESM-only package that Jest's CommonJS runtime cannot require (Node itself
// can). Vending is not exercised by this suite; any call here is a test bug.
const unused = () => { throw new Error('thriftHsmService is stubbed in the multi-meter test suite'); };
module.exports = new Proxy({}, { get: (t, k) => (k === '__esModule' ? false : unused) });
