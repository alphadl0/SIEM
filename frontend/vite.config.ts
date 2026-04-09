import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Plugin to safely mock Node's 'fs' for the browser instead of just externalizing it,
// avoiding runtime reference errors in environments strictly lacking 'fs'.
function browserPolyfillPlugin() {
  return {
    name: 'browser-polyfill',
    resolveId(source: string) {
      if (source === 'fs') {
        return '\0virtual:fs';
      }
      return null;
    },
    load(id: string) {
      if (id === '\0virtual:fs') {
        return 'export default {}; export const readFileSync = () => ""; export const writeFileSync = () => {};';
      }
      return null;
    }
  };
}

// Plugin to secure 'eval' usage in third-party Kusto packages.
// Direct evals inherit the local lexical scope which risks leaking sensitive variables
// and breaks under minification. Indirect eval (window.eval) only accesses global scope.
function secureEvalPlugin() {
  return {
    name: 'secure-eval',
    transform(code: string, id: string) {
      if (id.includes('@kusto') || id.includes('newtonsoft')) {
        return code.replace(/\beval\s*\(/g, 'window.eval(');
      }
      return null;
    }
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), browserPolyfillPlugin(), secureEvalPlugin()],
  build: {
    minify: false
  }
})
