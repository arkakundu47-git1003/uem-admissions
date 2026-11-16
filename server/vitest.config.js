export default {
  test: {
    env: {
      NODE_ENV: 'test',
      UPLOAD_DIR: './.test-uploads'
    },
    globalSetup: ['./tests/globalSetup.js'],
    // Several test files share one test database and wipe it, so files must run one after another.
    fileParallelism: false,
    hookTimeout: 120000,
    testTimeout: 30000
  }
};
