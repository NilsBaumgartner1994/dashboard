import { useMemo, useState } from 'react'
import { Box, Button, Stack, TextField, Typography } from '@mui/material'
import BaseTile from './BaseTile'
import type { TileInstance } from '../../store/useStore'
import { useStore } from '../../store/useStore'
import { useTileFlowStore } from '../../store/useTileFlowStore'
import { getLatestConnectedPayload } from '../../store/tileFlowHelpers'

const DEFAULT_CODE = `import React, { useEffect, useState } from 'react'

export default function ColorSquare() {
  const [isRed, setIsRed] = useState(true)

  useEffect(() => {
    const interval = setInterval(() => {
      setIsRed((previous) => !previous)
    }, 5000)

    return () => clearInterval(interval)
  }, [])

  return (
    <View
      style={{
        width: 40,
        height: 40,
        backgroundColor: isRed ? '#FF0000' : '#0000FF',
        transition: 'background-color 300ms ease',
      }}
    />
  )
}`

function makeSrcDoc(code: string): string {
  const escapedCode = code.replace(/<\/script>/gi, '<\\/script>')
  return `<!doctype html>
<html>
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <script crossorigin src="https://unpkg.com/react@18/umd/react.development.js"></script>
    <script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script>
    <script crossorigin src="https://unpkg.com/prop-types@15/prop-types.min.js"></script>
    <script crossorigin src="https://unpkg.com/@emotion/react@11/dist/emotion-react.umd.min.js"></script>
    <script crossorigin src="https://unpkg.com/@emotion/styled@11/dist/emotion-styled.umd.min.js"></script>
    <script crossorigin src="https://unpkg.com/@mui/material@5/umd/material-ui.development.js"></script>
    <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
    <style>
      html, body, #root { height: 100%; margin: 0; font-family: Arial, sans-serif; }
      body { padding: 8px; box-sizing: border-box; }
      .error { color: #b71c1c; white-space: pre-wrap; font-family: monospace; }
    </style>
  </head>
  <body>
    <div id="root"></div>
    <script type="text/babel">
      const View = ({ style, children, ...props }) => <div style={style} {...props}>{children}</div>;
      const Text = ({ style, children, ...props }) => <span style={style} {...props}>{children}</span>;

      function stripMarkdownFences(input) {
        const fenced = input.match(/^\`\`\`(?:jsx|tsx|javascript|js)?\s*([\s\S]*?)\s*\`\`\`$/i);
        return fenced ? fenced[1] : input;
      }

      function createRuntimeRequire(View, Text) {
        const reactNativeShim = {
          View,
          Text,
        };

        return function runtimeRequire(requestedModule) {
          if (requestedModule === 'react') return React;
          if (requestedModule === 'react-dom') return ReactDOM;
          if (requestedModule === 'react-native') return reactNativeShim;
          if (requestedModule === '@mui/material') {
            if (!window.MaterialUI) {
              throw new Error('MUI konnte nicht geladen werden. Bitte erneut rendern.');
            }

            return window.MaterialUI;
          }

          throw new Error('Import nicht unterstützt: ' + requestedModule + '. Erlaubt: react, react-dom, react-native, @mui/material');
        };
      }

      function resolveComponentExport(moduleExports) {
        if (typeof moduleExports === 'function') return moduleExports;

        if (moduleExports && typeof moduleExports.default === 'function') {
          return moduleExports.default;
        }

        if (moduleExports && typeof moduleExports === 'object') {
          const candidates = Object.entries(moduleExports)
            .filter(([key, value]) => key !== '__esModule' && typeof value === 'function');

          if (candidates.length === 1) {
            return candidates[0][1];
          }

          if (candidates.length > 1) {
            throw new Error('Bitte genau eine React-Komponente exportieren (default oder genau ein named export).');
          }
        }

        return null;
      }

      try {
        const userCode = ${JSON.stringify(escapedCode)};
        const trimmed = stripMarkdownFences(userCode).trim();

        let normalized = trimmed;
        if (normalized.startsWith('<')) {
          normalized = 'export default function App() { return (' + normalized + '); }';
        }

        const transformed = Babel.transform(normalized, {
          filename: 'rendered-component.tsx',
          presets: ['react', 'typescript'],
          plugins: ['transform-modules-commonjs'],
          sourceType: 'module',
        }).code;

        const moduleObject = { exports: {} };
        const runtimeRequire = createRuntimeRequire(View, Text);

        const executeModule = new Function('require', 'module', 'exports', transformed);
        executeModule(runtimeRequire, moduleObject, moduleObject.exports);

        const App = resolveComponentExport(moduleObject.exports);

        if (typeof App !== 'function') {
          throw new Error('Kein gültiger Export gefunden. Bitte genau eine Komponente exportieren.');
        }

        ReactDOM.createRoot(document.getElementById('root')).render(<App />);
      } catch (err) {
        document.getElementById('root').innerHTML = '<div class="error">' + String(err) + '</div>';
      }
    </script>
  </body>
</html>`
}

export default function ReactCodeRenderTile({ tile }: { tile: TileInstance }) {
  const tiles = useStore((s) => s.tiles)
  const outputs = useTileFlowStore((s) => s.outputs)
  const publishOutput = useTileFlowStore((s) => s.publishOutput)
  const latestConnectedPayload = getLatestConnectedPayload(tiles, outputs, tile.id)

  const [codeInput, setCodeInput] = useState((tile.config?.code as string) || DEFAULT_CODE)
  const [renderedCode, setRenderedCode] = useState((tile.config?.code as string) || DEFAULT_CODE)
  const srcDoc = useMemo(() => makeSrcDoc(renderedCode), [renderedCode])

  const handleApplyInput = () => {
    const content = latestConnectedPayload?.content?.trim()
    if (!content) return
    setCodeInput(content)
  }

  return (
    <BaseTile
      tile={tile}
      onSettingsOpen={() => setCodeInput((tile.config?.code as string) || DEFAULT_CODE)}
      getExtraConfig={() => ({ code: codeInput })}
    >
      <Stack spacing={1} sx={{ height: '100%' }}>
        <Typography variant="subtitle2" fontWeight={700}>React Code Renderer</Typography>
        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, minHeight: 220, flex: 1, minWidth: 0, overflow: 'hidden' }}>
          <TextField
            label="Code Eingabe"
            multiline
            minRows={12}
            value={codeInput}
            onChange={(e) => setCodeInput(e.target.value)}
            sx={{ minWidth: 0, '& .MuiInputBase-root': { height: '100%' }, '& textarea': { overflowX: 'auto' } }}
          />
          <Box sx={{ minWidth: 0, border: '1px solid', borderColor: 'divider', borderRadius: 1, minHeight: 220, bgcolor: 'background.paper', overflow: 'hidden' }}>
            <iframe title={`render-${tile.id}`} srcDoc={srcDoc} style={{ border: 0, width: '100%', height: '100%' }} sandbox="allow-scripts" />
          </Box>
        </Box>
        <Stack direction="row" spacing={1} flexWrap="wrap">
          <Button size="small" variant="contained" onClick={() => setRenderedCode(codeInput)}>Render / Refresh</Button>
          <Button size="small" variant="outlined" onClick={handleApplyInput} disabled={!latestConnectedPayload?.content}>Input übernehmen</Button>
          <Button size="small" variant="outlined" onClick={() => publishOutput(tile.id, { content: codeInput, dataType: 'text' })} disabled={!codeInput.trim()}>Code als Output senden</Button>
        </Stack>
      </Stack>
    </BaseTile>
  )
}
