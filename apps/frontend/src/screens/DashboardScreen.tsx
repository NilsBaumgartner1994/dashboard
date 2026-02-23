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

const MOBILE_COLS = 12
const MOBILE_ROW_HEIGHT = 60 // px per grid row unit on mobile
const DESKTOP_ROW_HEIGHT = 60 // px per grid row unit on desktop


/** Scales a tile's x/w from the desktop grid to the mobile grid. */
function getMobileTilePos(tile: TileInstance, desktopCols: number): { x: number; w: number } {
  const scale = MOBILE_COLS / desktopCols
  const rawX = Math.round(tile.x * scale)
  const rawW = Math.max(1, Math.round(tile.w * scale))
  const x = Math.min(rawX, MOBILE_COLS - 1)
  const w = Math.min(rawW, MOBILE_COLS - x)
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
}

function DraggableTile({
  tile,
  editMode,
  isMobile,
  gridColumns,
  anyModalOpen,
}: {
  tile: TileInstance
  editMode: boolean
  isMobile: boolean
  gridColumns: number
  anyModalOpen: boolean
}) {
  const { updateTile, removeTile } = useStore()
  const resizeStartRef = useRef<{ x: number; y: number; w: number; h: number } | null>(null)

  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: tile.id,
    disabled: !editMode || isMobile || anyModalOpen,
  })

  const { x: mobileX, w: mobileW } = getMobileTilePos(tile, gridColumns)
  const effectiveX = isMobile ? mobileX : tile.x
  const effectiveW = isMobile ? mobileW : tile.w

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
    const gridColCount = isMobile ? MOBILE_COLS : gridColumns
    const cellW = gridEl.clientWidth / gridColCount
    const cellH = isMobile ? MOBILE_ROW_HEIGHT : DESKTOP_ROW_HEIGHT
    const dx = Math.round((e.clientX - resizeStartRef.current.x) / cellW)
    const dy = Math.round((e.clientY - resizeStartRef.current.y) / cellH)
    const newW = Math.max(1, Math.min(gridColCount - tile.x, resizeStartRef.current.w + dx))
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

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, delta } = event
    const tile = tiles.find((t) => t.id === active.id)
    if (!tile) return
    const gridEl = document.getElementById('dashboard-grid')
    if (!gridEl) return
    const gridColCount = isMobile ? MOBILE_COLS : gridColumns
    const cellW = gridEl.clientWidth / gridColCount
    const cellH = isMobile ? MOBILE_ROW_HEIGHT : DESKTOP_ROW_HEIGHT
    const dx = Math.round(delta.x / cellW)
    const dy = Math.round(delta.y / cellH)
    if (dx === 0 && dy === 0) return
    const dxDesktop = isMobile ? dx * Math.round(gridColumns / MOBILE_COLS) : dx
    const nx = Math.max(0, Math.min(gridColumns - tile.w, tile.x + dxDesktop))
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
                gridTemplateColumns: `repeat(${isMobile ? MOBILE_COLS : gridColumns}, 1fr)`,
                gridAutoRows: `${isMobile ? MOBILE_ROW_HEIGHT : DESKTOP_ROW_HEIGHT}px`,
                width: '100%',
                gap: 0.5,
              }}
            >
              {tiles.map((tile) => (
                <DraggableTile key={tile.id} tile={tile} editMode={editMode} isMobile={isMobile} gridColumns={gridColumns} anyModalOpen={anyModalOpen} />
              ))}
            </Box>
          </DndContext>
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
