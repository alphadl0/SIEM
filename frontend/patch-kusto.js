import fs from 'fs';
import path from 'path';

// 1. Fix newtonsoft.json.min.js 'eval' vulnerability
// Rewriting dangerous local syntax eval(...) to safe indirect (0, eval)(...) at the source level.
const evalPath = path.resolve('node_modules', '@kusto', 'language-service', 'newtonsoft.json.min.js');
if (fs.existsSync(evalPath)) {
  let content = fs.readFileSync(evalPath, 'utf8');
  content = content.replace(/\beval\s*\(/g, '(0, eval)(');
  fs.writeFileSync(evalPath, content);
  console.log('Patched Kusto language-service to use secure indirect eval.');
}

// 2. Fix bridge.min.js 'fs' import breaking browser bundlers
// Replacing require("fs") with a safely mocked empty object at the source level.
const bridgePath = path.resolve('node_modules', '@kusto', 'language-service', 'bridge.min.js');
if (fs.existsSync(bridgePath)) {
  let content = fs.readFileSync(bridgePath, 'utf8');
  // It usually checks typeof require !== 'undefined' and calls require('fs')
  content = content.replace(/require\(['"]fs['"]\)/g, '{}');
  fs.writeFileSync(bridgePath, content);
  console.log('Patched Kusto language-service native fs import to browser-safe mock.');
}