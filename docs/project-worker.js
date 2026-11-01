importScripts("source-utils.js?v=20261102-bugfix1", "project-core.js?v=20261102-bugfix1", "vendor/babel.js");
self.onmessage = async (event) => {
  try {
    const report = await ProjectCore.analyze(event.data, async (source, ext) => {
      const parsers = self.prettierPlugins.babel.parsers;
      return parsers[/^tsx?$/.test(ext) ? "babel-ts" : "babel"].parse(source, {});
    });
    self.postMessage({ report });
  } catch (error) {
    self.postMessage({ error: error.message });
  }
};
