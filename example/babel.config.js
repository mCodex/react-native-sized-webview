const path = require('node:path');
const { getConfig } = require('react-native-builder-bob/babel-config');
const pkg = require('../package.json');

const root = path.resolve(__dirname, '..');

module.exports = (api) => {
  api.cache(true);

  const config = getConfig(
    {
      presets: ['babel-preset-expo'],
    },
    { root, pkg }
  );

  // React Compiler must run before other transforms. React 19 ships its own
  // runtime, so no `react-compiler-runtime` package is required.
  config.plugins = ['babel-plugin-react-compiler', ...(config.plugins ?? [])];

  return config;
};
