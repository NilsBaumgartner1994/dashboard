import { useState, useRef } from 'react'
import {
  Box,
  IconButton,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  Grid,
  Card,
  CardActionArea,
  CardContent,
  Typography,
  useTheme,
  useMediaQuery,
} from '@mui/material'
import SettingsIcon from '@mui/icons-material/Settings'
import AddIcon from '@mui/icons-material/Add'
import DeleteIcon from '@mui/icons-material/Delete'
import VisibilityIcon from '@mui/icons-material/Visibility'
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff'
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  useDraggable,
} from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { useStore } from '../store/useStore'
import type { TileInstance } from '../store/useStore'
import { useUIStore } from '../store/useUIStore'
import SampleTile from '../components/tiles/SampleTile'
import ServerTile from '../components/tiles/ServerTile'
import RocketMealsTile from '../components/tiles/RocketMealsTile'
import GoogleCalendarTile from '../components/tiles/GoogleCalendarTile'
import WeatherTile from '../components/tiles/WeatherTile'
import NewsTile from '../components/tiles/NewsTile'
import RouteTile from '../components/tiles/RouteTile'
import GoogleTasksTile from '../components/tiles/GoogleTasksTile'
import NotesTile from '../components/tiles/NotesTile'
import PostItTile from '../components/tiles/PostItTile'
import AiAgentTile from '../components/tiles/AiAgentTile'
import VoiceTtsTile from '../components/tiles/VoiceTtsTile'
import DockerLogsTile from '../components/tiles/DockerLogsTile'
import SpeechToTextTile from '../components/tiles/SpeechToTextTile'
import ReactCodeRenderTile from '../components/tiles/ReactCodeRenderTile'
import SpeechLibraryTile from '../components/tiles/SpeechLibraryTile'
import ApiSwitchTile from '../components/tiles/ApiSwitchTile'
import { getOutputTargets } from '../store/tileFlowHelpers'

/** Height of one grid row unit in rem. Using rem ensures tiles scale with the user's font-size. */
const ROW_HEIGHT_REM = 4
/** Fallback px value for 1 rem when `getComputedStyle` is unavailable (e.g., SSR/tests). */
const DEFAULT_REM_PX = 16

/**
 * Returns the effective number of grid columns for the current viewport width.
 * Columns scale up from 4 (xs/phone) to `maxColumns` (xl/large desktop), so tiles
 * automatically fill the available screen space and never overflow their row.
 */
function useResponsiveColumns(maxColumns: number): number {
  const theme = useTheme()
  const isXs = useMediaQuery(theme.breakpoints.only('xs'))  // < 600 px
  const isSm = useMediaQuery(theme.breakpoints.only('sm'))  // 600–900 px
  const isMd = useMediaQuery(theme.breakpoints.only('md'))  // 900–1200 px
  const isLg = useMediaQuery(theme.breakpoints.only('lg'))  // 1200–1536 px
  // xl: ≥ 1536 px → full maxColumns
  if (isXs) return Math.min(4, maxColumns)
  if (isSm) return Math.min(8, maxColumns)
  if (isMd) return Math.min(12, maxColumns)
  if (isLg) return Math.min(16, maxColumns)
  return maxColumns
}

/**
 * Scales a tile's column position/width from the stored grid (maxCols) to the
 * currently visible grid (effectiveCols). When effectiveCols < maxCols the tile
 * is proportionally shrunk so it still occupies the same *fraction* of the screen,
 * and its width is capped so it never overflows the available columns.
 */
function getScaledTilePos(tile: TileInstance, effectiveCols: number, maxCols: number): { x: number; w: number } {
  if (effectiveCols >= maxCols) return { x: tile.x, w: tile.w }
  const scale = effectiveCols / maxCols
  const rawX = Math.round(tile.x * scale)
  const rawW = Math.max(1, Math.round(tile.w * scale))
  const x = Math.min(rawX, effectiveCols - 1)
  const w = Math.min(rawW, effectiveCols - x)
  return { x, w }
}

const tileRegistry: Record<string, { label: string; component: React.FC<{ tile: TileInstance }> }> = {
  sample: { label: 'Sample Tile', component: SampleTile },
  server: { label: 'Server Status', component: ServerTile },
  rocketmeals: { label: 'Rocket Meals Server', component: RocketMealsTile },
  googlecalendar: { label: 'Google Kalender', component: GoogleCalendarTile },
  weather: { label: 'Wetter', component: WeatherTile },
  news: { label: 'News (RSS)', component: NewsTile },
  route: { label: 'Route & Fahrtzeit', component: RouteTile },
  tasks: { label: 'Aufgaben (Google Tasks)', component: GoogleTasksTile },
  notes: { label: 'Notizen', component: NotesTile },
  postit: { label: 'Notizzettel (Post-it)', component: PostItTile },
  aiagent: { label: 'KI-Agent (Ollama)', component: AiAgentTile },
  voicetts: { label: 'Sprachausgabe (TTS)', component: VoiceTtsTile },
  dockerlogs: { label: 'Docker Logs', component: DockerLogsTile },
  speechtotext: { label: 'Speech to Text', component: SpeechToTextTile },
  reactcoderender: { label: 'React Code Renderer', component: ReactCodeRenderTile },
  speechlibrary: { label: 'Speech Aufnahme/Player', component: SpeechLibraryTile },
  apiswitch: { label: 'API Switch (Schwellwert)', component: ApiSwitchTile },
}

interface TileConnection {
  from: TileInstance
  to: TileInstance
}

function getTileConnections(tiles: TileInstance[]): TileConnection[] {
  const byId = new Map(tiles.map((t) => [t.id, t]))
  const connections: TileConnection[] = []

  tiles.forEach((tile) => {
    const targets = getOutputTargets(tile)
    targets.forEach((targetId) => {
      const target = byId.get(targetId)
      if (!target) return
      connections.push({ from: tile, to: target })
    })
  })

  return connections
}

function DraggableTile({
  tile,
  editMode,
  isMobile,
  effectiveCols,
  gridColumns,
  anyModalOpen,
}: {
  tile: TileInstance
  editMode: boolean
  isMobile: boolean
  effectiveCols: number
  gridColumns: number
  anyModalOpen: boolean
}) {
  const { updateTile, removeTile } = useStore()
  const resizeStartRef = useRef<{ x: number; y: number; w: number; h: number } | null>(null)

  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: tile.id,
    disabled: !editMode || isMobile || anyModalOpen,
  })

  const { x: effectiveX, w: effectiveW } = getScaledTilePos(tile, effectiveCols, gridColumns)

  const style: React.CSSProperties = {
    gridColumn: `${effectiveX + 1} / span ${effectiveW}`,
    gridRow: `${tile.y + 1} / span ${tile.h}`,
    transform: transform ? CSS.Translate.toString(transform) : undefined,
    position: 'relative',
    display: tile.hidden && !editMode ? 'none' : undefined,
    opacity: tile.hidden ? 0.4 : 1,
  }

  const TileComp = tileRegistry[tile.type]?.component ?? SampleTile

  const handleResizePointerDown = (e: React.PointerEvent) => {
    e.preventDefault()
    e.stopPropagation()
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    resizeStartRef.current = { x: e.clientX, y: e.clientY, w: tile.w, h: tile.h }
  }

  const handleResizePointerMove = (e: React.PointerEvent) => {
    if (!resizeStartRef.current) return
    const gridEl = document.getElementById('dashboard-grid')
    if (!gridEl) return
    const remPx = parseFloat(getComputedStyle(document.documentElement).fontSize)
    const cellW = gridEl.clientWidth / effectiveCols
    const cellH = ROW_HEIGHT_REM * remPx
    const dx = Math.round((e.clientX - resizeStartRef.current.x) / cellW)
    const dy = Math.round((e.clientY - resizeStartRef.current.y) / cellH)
    // Convert dx from effectiveCols-space back to gridColumns-space
    const dxStored = effectiveCols < gridColumns ? Math.round(dx * gridColumns / effectiveCols) : dx
    const newW = Math.max(1, Math.min(gridColumns - tile.x, resizeStartRef.current.w + dxStored))
    const newH = Math.max(1, resizeStartRef.current.h + dy)
    if (newW !== tile.w || newH !== tile.h) {
      updateTile(tile.id, { w: newW, h: newH })
    }
  }

  const handleResizePointerUp = () => {
    resizeStartRef.current = null
  }

  return (
    <Box ref={setNodeRef} style={style}>
      <Box
        sx={{ height: '100%', cursor: editMode ? 'grab' : 'default' }}
        {...(editMode ? { ...listeners, ...attributes } : {})}
      >
        <TileComp tile={tile} />
      </Box>
      {editMode && (
        <>
          <Box
            sx={{
              position: 'absolute',
              top: 4,
              right: 4,
              display: 'flex',
              gap: 0.25,
              backgroundColor: 'background.paper',
              borderRadius: 1,
              p: 0.5,
              zIndex: 10,
            }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <Tooltip title={tile.hidden ? 'Show' : 'Hide'}>
              <IconButton size="small" onClick={() => updateTile(tile.id, { hidden: !tile.hidden })}>
                {tile.hidden ? <VisibilityIcon fontSize="inherit" /> : <VisibilityOffIcon fontSize="inherit" />}
              </IconButton>
            </Tooltip>
            <Tooltip title="Delete">
              <IconButton size="small" color="error" onClick={() => removeTile(tile.id)}>
                <DeleteIcon fontSize="inherit" />
              </IconButton>
            </Tooltip>
          </Box>
          {!isMobile && (
            <Box
              sx={{
                position: 'absolute',
                bottom: 0,
                right: 0,
                width: 20,
                height: 20,
                cursor: 'se-resize',
                zIndex: 11,
                display: 'flex',
                alignItems: 'flex-end',
                justifyContent: 'flex-end',
                p: '3px',
              }}
              onPointerDown={handleResizePointerDown}
              onPointerMove={handleResizePointerMove}
              onPointerUp={handleResizePointerUp}
            >
              <Box
                sx={{
                  width: 12,
                  height: 12,
                  borderRight: '2px solid',
                  borderBottom: '2px solid',
                  borderColor: 'primary.main',
                  opacity: 0.8,
                }}
              />
            </Box>
          )}
        </>
      )}
    </Box>
  )
}

export default function DashboardScreen() {
  const { tiles, editMode, toggleEditMode, addTile, updateTile, gridColumns } = useStore()
  const anyModalOpen = useUIStore((s) => s.openModalCount > 0)
  const [addOpen, setAddOpen] = useState(false)
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'))
  const effectiveCols = useResponsiveColumns(gridColumns)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))
  const tileConnections = getTileConnections(tiles)
  const remPx = typeof window !== 'undefined' ? parseFloat(getComputedStyle(document.documentElement).fontSize) : DEFAULT_REM_PX
  const rowHeightPx = ROW_HEIGHT_REM * remPx
  const overlayHeight = Math.max(1, ...tiles.map((tile) => tile.y + tile.h)) * rowHeightPx

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, delta } = event
    const tile = tiles.find((t) => t.id === active.id)
    if (!tile) return
    const gridEl = document.getElementById('dashboard-grid')
    if (!gridEl) return
    const cellW = gridEl.clientWidth / effectiveCols
    const remPxNow = parseFloat(getComputedStyle(document.documentElement).fontSize)
    const cellH = ROW_HEIGHT_REM * remPxNow
    const dx = Math.round(delta.x / cellW)
    const dy = Math.round(delta.y / cellH)
    if (dx === 0 && dy === 0) return
    // Convert horizontal delta from effectiveCols-space back to stored gridColumns-space
    const dxStored = effectiveCols < gridColumns ? Math.round(dx * gridColumns / effectiveCols) : dx
    const nx = Math.max(0, Math.min(gridColumns - tile.w, tile.x + dxStored))
    const ny = Math.max(0, tile.y + dy)
    updateTile(tile.id, { x: nx, y: ny })
  }

  return (
    <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Top bar */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', px: 2, py: 1, flexShrink: 0 }}>
        {editMode && (
          <Tooltip title="Add tile">
            <IconButton onClick={() => setAddOpen(true)} color="primary">
              <AddIcon />
            </IconButton>
          </Tooltip>
        )}
        <Tooltip title={editMode ? 'Exit edit mode' : 'Edit mode'}>
          <IconButton onClick={toggleEditMode} color={editMode ? 'primary' : 'default'}>
            <SettingsIcon />
          </IconButton>
        </Tooltip>
      </Box>

      {/* Grid area */}
      <Box sx={{ flex: 1, px: 2, pb: 2, overflow: 'auto' }}>
        <Box
          sx={{
            width: '100%',
            position: 'relative',
            border: editMode ? `2px dashed ${theme.palette.primary.main}` : 'none',
            boxSizing: 'border-box',
          }}
        >
          <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
            <Box
              id="dashboard-grid"
              sx={{
                display: 'grid',
                gridTemplateColumns: `repeat(${effectiveCols}, 1fr)`,
                gridAutoRows: `${ROW_HEIGHT_REM}rem`,
                width: '100%',
                gap: 0.5,
                position: 'relative',
                zIndex: 1,
              }}
            >
              {tiles.map((tile) => (
                <DraggableTile key={tile.id} tile={tile} editMode={editMode} isMobile={isMobile} effectiveCols={effectiveCols} gridColumns={gridColumns} anyModalOpen={anyModalOpen} />
              ))}
            </Box>
          </DndContext>
          {tileConnections.length > 0 && (
            <svg
              width="100%"
              height={overlayHeight}
              viewBox={`0 0 100 ${overlayHeight}`}
              preserveAspectRatio="none"
              style={{ position: 'absolute', left: 0, top: 0, pointerEvents: 'none', zIndex: 0 }}
            >
              {tileConnections.map((connection) => {
                const fromLayout = getScaledTilePos(connection.from, effectiveCols, gridColumns)
                const toLayout = getScaledTilePos(connection.to, effectiveCols, gridColumns)
                const fromX = ((fromLayout.x + fromLayout.w / 2) / effectiveCols) * 100
                const fromY = (connection.from.y + connection.from.h / 2) * rowHeightPx
                const toX = ((toLayout.x + toLayout.w / 2) / effectiveCols) * 100
                const toY = (connection.to.y + connection.to.h / 2) * rowHeightPx
                const pathD = `M ${fromX} ${fromY} L ${toX} ${toY}`
                const key = `${connection.from.id}-${connection.to.id}`
                return (
                  <path
                    key={key}
                    d={pathD}
                    stroke={theme.palette.primary.main}
                    strokeWidth="2"
                    fill="none"
                    opacity="0.95"
                  />
                )
              })}
            </svg>
          )}
          {editMode && (
            <Tooltip title="Add tile">
              <IconButton
                onClick={() => setAddOpen(true)}
                color="primary"
                sx={{
                  position: 'absolute',
                  bottom: 16,
                  right: 16,
                  backgroundColor: 'primary.main',
                  color: 'primary.contrastText',
                  '&:hover': { backgroundColor: 'primary.dark' },
                }}
              >
                <AddIcon />
              </IconButton>
            </Tooltip>
          )}
        </Box>
      </Box>

      {/* Add tile dialog */}
      <Dialog open={addOpen} onClose={() => setAddOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Add Tile</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 0 }}>
            {Object.entries(tileRegistry).map(([key, reg]) => (
              <Grid item xs={6} sm={4} key={key}>
                <Card>
                  <CardActionArea
                    onClick={() => {
                      addTile(key)
                      setAddOpen(false)
                    }}
                  >
                    <CardContent sx={{ textAlign: 'center' }}>
                      <AddIcon sx={{ fontSize: 40, color: 'primary.main' }} />
                      <Typography variant="body2">{reg.label}</Typography>
                    </CardContent>
                  </CardActionArea>
                </Card>
              </Grid>
            ))}
          </Grid>
        </DialogContent>
      </Dialog>
    </Box>
  )
}
