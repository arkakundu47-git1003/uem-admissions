
export default {
  test: {
    env: {
      NODE_ENV: 'test',
      UPLOAD_DIR: './.test-uploads'
    },
    hookTimeout: 120000,
    testTimeout: 30000
  }
};
