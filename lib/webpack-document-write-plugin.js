// Webpack plugin to remove document.write() calls
class RemoveDocumentWritePlugin {
  apply(compiler) {
    compiler.hooks.compilation.tap('RemoveDocumentWritePlugin', (compilation) => {
      compilation.hooks.processAssets.tap(
        {
          name: 'RemoveDocumentWritePlugin',
          stage: compilation.PROCESS_ASSETS_STAGE_OPTIMIZE_INLINE,
        },
        (assets) => {
          Object.entries(assets).forEach(([pathname, source]) => {
            if (pathname.endsWith('.js')) {
              let content = source.source();
              
              // Replace document.write with a no-op function
              if (content.includes('document.write')) {
                content = content.replace(
                  /document\.write\s*\(/g,
                  '(function(){}/*document.write*/('
                );
                
                // Update the asset
                compilation.updateAsset(
                  pathname,
                  new compiler.webpack.sources.RawSource(content)
                );
              }
            }
          });
        }
      );
    });
  }
}

module.exports = RemoveDocumentWritePlugin;