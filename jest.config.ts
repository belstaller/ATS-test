import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/server'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        tsconfig: 'tsconfig.server.json',
      },
    ],
  },
  // Increase timeout since some tests mock async DB calls
  testTimeout: 10000,
  // Coverage configuration
  collectCoverageFrom: [
    'server/controllers/**/*.ts',
    'server/routes/**/*.ts',
    'server/middleware/**/*.ts',
    'server/services/**/*.ts',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov'],
};

export default config;
