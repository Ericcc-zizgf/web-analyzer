importScripts("project-core.js", "vendor/babel.js");
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
