// tsc compiles only .ts files; the agent prompt .md files under src/ must
// land next to their compiled modules in dist/src (loadPrompt resolves them
// relative to import.meta.url). Runs as part of `npm run build`.
import { cpSync, statSync } from 'node:fs';

cpSync('src', 'dist/src', {
  recursive: true,
  filter: (source) => statSync(source).isDirectory() || source.endsWith('.md'),
});
console.log('copied src/**/*.md into dist/src/');
