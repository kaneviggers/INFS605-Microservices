module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  testMatch: ["**/*.test.ts"],
  globalSetup: "./jest.global-setup.ts",
  globalTeardown: "./jest.global-teardown.ts",
  testTimeout: 30000, // first run pulls the postgres image
};
