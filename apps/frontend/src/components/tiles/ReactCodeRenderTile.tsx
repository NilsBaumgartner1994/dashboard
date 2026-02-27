import { useMemo, useState } from 'react'
import { Box, Button, Stack, TextField, Typography } from '@mui/material'
import BaseTile from './BaseTile'
import type { TileInstance } from '../../store/useStore'
import { useStore } from '../../store/useStore'
import { useTileFlowStore } from '../../store/useTileFlowStore'
import { getLatestConnectedPayload } from '../../store/tileFlowHelpers'

const DEFAULT_CODE = `<View style={{padding: 16, border: '1px solid #888', borderRadius: 8}}>
  <Text>Hallo von der React Code Kachel 👋</Text>
</View>`

function makeSrcDoc(code: string): string {
  const escapedCode = code.replace(/<\/script>/gi, '<\\/script>')
  return `<!doctype html>
<html>
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <script crossorigin src="https://unpkg.com/react@18/umd/react.development.js"></script>
    <script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script>
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

      try {
        const userCode = ${JSON.stringify(escapedCode)};
        const trimmed = stripMarkdownFences(userCode).trim();

        let normalized = trimmed;
        if (/export\s+default/.test(normalized)) {
          normalized = normalized.replace(/export\s+default/, 'const __DefaultExport =');
        }

        const hasNamedApp = /(function\s+App\s*\()|(const\s+App\s*=)|(let\s+App\s*=)|(var\s+App\s*=)|(class\s+App\s+)/.test(normalized);
        if (!hasNamedApp && normalized.startsWith('<')) {
          normalized = 'function App() { return (' + normalized + '); }';
        }

        const transformed = Babel.transform(normalized, { presets: ['react', 'typescript'] }).code;
        const resolveApp = new Function(
          'React',
          'View',
          'Text',
          transformed + '; return typeof App === "function" ? App : (typeof __DefaultExport === "function" ? __DefaultExport : null);',
        );
        const App = resolveApp(React, View, Text);

        if (typeof App !== 'function') {
          throw new Error('Bitte "App" Funktion definieren oder JSX einfügen.');
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
        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, minHeight: 220, flex: 1 }}>
          <TextField
            label="Code Eingabe"
            multiline
            minRows={12}
            value={codeInput}
            onChange={(e) => setCodeInput(e.target.value)}
            sx={{ '& .MuiInputBase-root': { height: '100%' } }}
          />
          <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, minHeight: 220, bgcolor: 'background.paper' }}>
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
