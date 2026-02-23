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

export default {
  plugins: [
    // Your plugins here
  ],
  onwarn(warning, warn) {
    if (warning.code === 'THIS_IS_UNDEFINED' && warning.loc?.file && (warning.loc.file.includes('puppeteer-core') || warning.loc.file.includes('yargs'))) {
      return; // Suppress Puppeteer & Yargs 'this' warnings
    }
    warn(warning); // Show other warnings normally
  },
};
