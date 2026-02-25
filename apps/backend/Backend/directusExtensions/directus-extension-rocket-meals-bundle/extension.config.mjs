// Script/Config for directus extension building and surpressing specific logs.
// https://github.com/directus/directus/discussions/24673
// Wir haben puppeteer in directus zum laufen gebracht. Allerdings wurde dann beim builden des plugins warnings angezeigt, dass "puppeteer-core" nicht "gut" ist. Es nutzt "this" und das mochte directus nicht.
// Daher wurden eklige warnings angezeigt. Diese Warnings von "puppeteer-core" und "yargs" werden hiermit gefiltert.

// Store the original console methods
const originalConsoleWarn = console.warn;
const originalConsoleError = console.error;

// Override console.warn to filter specific warnings
console.warn = message => {
  if (typeof message === 'string' && (message.includes('puppeteer-core') || message.includes('yargs')) && message.includes("The 'this' keyword is equivalent to 'undefined' at the top level of an ES module")) {
    return; // Suppress Puppeteer & Yargs 'this' warnings
  }

  originalConsoleWarn(message); // Log other warnings normally
};

// Override console.error to filter specific errors (if needed)
console.error = message => {
  if (typeof message === 'string' && (message.includes('puppeteer-core') || message.includes('yargs')) && message.includes("The 'this' keyword is equivalent to 'undefined' at the top level of an ES module")) {
    return; // Suppress Puppeteer & Yargs errors if necessary
  }

  originalConsoleError(message); // Log other errors normally
};

// Plugin to inject __dirname/__filename shims for bundled CommonJS code that
// references these CJS globals (e.g. ffmpeg-static) in an ESM output bundle.
const injectDirnameShim = {
  name: 'inject-dirname-shim',
  renderChunk(code) {
    if (!code.includes('__dirname') && !code.includes('__filename')) return null;
    const shim = [
      `import { fileURLToPath as _shim_fileURLToPath } from 'url';`,
      `import { dirname as _shim_dirname } from 'path';`,
      `const __filename = _shim_fileURLToPath(import.meta.url);`,
      `const __dirname = _shim_dirname(__filename);`,
    ].join('\n') + '\n';
    return { code: shim + code, map: null };
  },
};

export default {
  plugins: [
    injectDirnameShim,
  ],
  onwarn(warning, warn) {
    if (warning.code === 'THIS_IS_UNDEFINED' && warning.loc?.file && (warning.loc.file.includes('puppeteer-core') || warning.loc.file.includes('yargs'))) {
      return; // Suppress Puppeteer & Yargs 'this' warnings
    }
    warn(warning); // Show other warnings normally
  },
};
