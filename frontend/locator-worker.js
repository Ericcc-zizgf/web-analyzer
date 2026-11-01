importScripts(
  "source-utils.js" + self.location.search,
  "vendor/babel.js",
  "vendor/postcss.js",
  "locator-core.js" + self.location.search,
);
let index = null;
self.onmessage = async (event) => {
  const { id, type } = event.data;
  try {
    if (type === "build") {
      index = await LocatorCore.build(
        event.data.files,
        {
          js: (source, ts) =>
            self.prettierPlugins.babel.parsers[ts ? "babel-ts" : "babel"].parse(
              source,
              {},
            ),
          css: (source) => self.prettierPlugins.postcss.parsers.css.parse(source, {}),
        },
        (done, total, path) => {
          if (done % 5 === 0 || done === total)
            self.postMessage({ id, progress: { done, total, path } });
        },
      );
      self.postMessage({
        id,
        result: {
          records: index.records.filter(
            (r) => r.type === "css" || (r.selector && typeof r.selector === "object"),
          ),
          coverage: index.coverage,
          gaps: index.gaps,
        },
      });
    } else if (type === "query") {
      if (!index) throw Error("原始碼索引尚未建立");
      self.postMessage({ id, result: LocatorCore.query(index, event.data.selection) });
    }
  } catch (e) {
    self.postMessage({ id, error: e.message });
  }
};
