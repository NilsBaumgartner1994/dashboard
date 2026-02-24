import { useEffect, useMemo, useState } from 'react'
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  MenuItem,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import RefreshIcon from '@mui/icons-material/Refresh'
import TerminalIcon from '@mui/icons-material/Terminal'
import BaseTile from './BaseTile'
import type { TileInstance } from '../../store/useStore'
import { useStore } from '../../store/useStore'

interface ContainerInfo {
  id: string
  name: string
  names: string[]
  state: string
  status: string
  image: string
}

const DEFAULT_TAIL = 300

export default function DockerLogsTile({ tile }: { tile: TileInstance }) {
  const backendUrl = useStore((s) => s.backendUrl)
  const endpointBase = `${backendUrl}/docker-logs`

  const [containerFilter, setContainerFilter] = useState<string>((tile.config?.containerFilter as string) || '')
  const [selectedContainer, setSelectedContainer] = useState<string>((tile.config?.selectedContainer as string) || '')
  const [tailInput, setTailInput] = useState<string>(String((tile.config?.tail as number) || DEFAULT_TAIL))

  const [containers, setContainers] = useState<ContainerInfo[]>([])
  const [logs, setLogs] = useState<string>('')
  const [loadingContainers, setLoadingContainers] = useState(false)
  const [loadingLogs, setLoadingLogs] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const containerOptions = useMemo(() => containers, [containers])

  const loadContainers = async () => {
    setLoadingContainers(true)
    setError(null)
    try {
      const query = containerFilter.trim()
        ? `?all=1&filter=${encodeURIComponent(containerFilter.trim())}`
        : '?all=1'
      const res = await fetch(`${endpointBase}/containers${query}`, { signal: AbortSignal.timeout(15_000) })
      const data = await res.json()
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error ?? `HTTP ${res.status}`)
      }
      setContainers(data.containers ?? [])
    } catch (err) {
      setError(String(err))
    } finally {
      setLoadingContainers(false)
    }
  }

  const loadLogs = async () => {
    if (!selectedContainer) return
    setLoadingLogs(true)
    setError(null)
    try {
      const tail = Math.max(1, Number.parseInt(tailInput, 10) || DEFAULT_TAIL)
      const res = await fetch(
        `${endpointBase}/logs?container=${encodeURIComponent(selectedContainer)}&tail=${tail}`,
        { signal: AbortSignal.timeout(30_000) },
      )
      const data = await res.json()
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error ?? `HTTP ${res.status}`)
      }
      setLogs(String(data.combined ?? ''))
    } catch (err) {
      setError(String(err))
    } finally {
      setLoadingLogs(false)
    }
  }

  const copyLogs = async () => {
    try {
      await navigator.clipboard.writeText(logs)
    } catch {
      // noop: keep UI simple
    }
  }

  useEffect(() => {
    loadContainers()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <BaseTile
      tile={tile}
      onSettingsOpen={() => {
        setContainerFilter((tile.config?.containerFilter as string) || '')
        setSelectedContainer((tile.config?.selectedContainer as string) || '')
        setTailInput(String((tile.config?.tail as number) || DEFAULT_TAIL))
      }}
      settingsChildren={(
        <Box>
          <Divider sx={{ my: 2 }}>Docker Logs</Divider>
          <TextField
            fullWidth
            label="Container-Filter"
            value={containerFilter}
            onChange={(e) => setContainerFilter(e.target.value)}
            sx={{ mb: 2 }}
          />
          <TextField
            fullWidth
            label="Zeilen (tail)"
            type="number"
            inputProps={{ min: 1, max: 2000 }}
            value={tailInput}
            onChange={(e) => setTailInput(e.target.value)}
          />
        </Box>
      )}
      getExtraConfig={() => ({
        containerFilter,
        selectedContainer,
        tail: Math.max(1, Number.parseInt(tailInput, 10) || DEFAULT_TAIL),
      })}
    >
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, height: '100%' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <TerminalIcon color="primary" fontSize="small" />
          <Typography variant="subtitle2" fontWeight="bold" sx={{ flex: 1 }}>
            Docker Logs
          </Typography>
          <Tooltip title="Containerliste neu laden">
            <span>
              <Button size="small" onClick={loadContainers} disabled={loadingContainers} startIcon={<RefreshIcon fontSize="small" />}>
                Refresh
              </Button>
            </span>
          </Tooltip>
        </Box>

        <Stack direction="row" spacing={1} alignItems="center">
          <TextField
            select
            size="small"
            label="Container"
            value={selectedContainer}
            onChange={(e) => setSelectedContainer(e.target.value)}
            sx={{ minWidth: 220, flex: 1 }}
          >
            {containerOptions.map((container) => (
              <MenuItem key={container.id} value={container.name}>
                {container.name}
              </MenuItem>
            ))}
          </TextField>
          <Button size="small" variant="contained" onClick={loadLogs} disabled={!selectedContainer || loadingLogs}>
            Logs laden
          </Button>
          <Button size="small" variant="outlined" onClick={copyLogs} startIcon={<ContentCopyIcon fontSize="small" />} disabled={!logs}>
            Copy
          </Button>
        </Stack>

        {selectedContainer && (
          <Box>
            {containerOptions.filter((c) => c.name === selectedContainer).map((c) => (
              <Stack direction="row" spacing={1} key={c.id} sx={{ mb: 1, flexWrap: 'wrap' }}>
                <Chip size="small" label={c.state} />
                <Chip size="small" label={c.status} variant="outlined" />
                <Chip size="small" label={c.image} />
              </Stack>
            ))}
          </Box>
        )}

        {error && <Typography color="error" variant="caption">{error}</Typography>}

        <Box sx={{ flex: 1, minHeight: 120, overflow: 'auto', bgcolor: 'background.default', borderRadius: 1, p: 1 }}>
          {loadingLogs ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
              <CircularProgress size={20} />
            </Box>
          ) : (
            <Typography component="pre" sx={{ m: 0, fontSize: '0.72rem', whiteSpace: 'pre-wrap' }}>
              {logs || 'Keine Logs geladen.'}
            </Typography>
          )}
        </Box>
      </Box>
    </BaseTile>
  )
}
