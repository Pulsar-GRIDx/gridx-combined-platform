// The backend is plain CommonJS that Node runs directly. Babel's stricter
// parser rejects some existing files (e.g. a duplicated function
// declaration in routes/meterPercentageCountRoutes.js), so this suite runs
// the code untransformed, exactly as Node does.
module.exports = {
  rootDir: '../..',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/tests/multiMeter/**/*.test.js'],
  transform: {},
  moduleNameMapper: { 'thriftHsmService$': '<rootDir>/tests/multiMeter/stubs/thriftHsmService.js' },
};
