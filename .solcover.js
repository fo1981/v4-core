module.exports = {
  mocha: { reporter: 'mocha-junit-reporter' },
  providerOptions: {
    network_id: 1337,
    _chainId: 1337,
    _chainIdRpc: 1337
  },
  skipFiles: [
    "external",
    "import",
    "test",
  ]
};
