import { useState } from 'react'
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
} from '@mui/material'
import SettingsIcon from '@mui/icons-material/Settings'
import AddIcon from '@mui/icons-material/Add'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import ArrowForwardIcon from '@mui/icons-material/ArrowForward'
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward'
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward'
import DeleteIcon from '@mui/icons-material/Delete'
import VisibilityIcon from '@mui/icons-material/Visibility'
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff'
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline'
import RemoveCircleOutlineIcon from '@mui/icons-material/RemoveCircleOutline'
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
import SampleTile from '../components/tiles/SampleTile'
import RocketMealsTile from '../components/tiles/RocketMealsTile'

const GRID_COLS = 32
const GRID_ROWS = 18

const tileRegistry: Record<string, { label: string; component: React.FC<{ tile: TileInstance }> }> = {
  sample: { label: 'Sample Tile', component: SampleTile },
  rocketmeals: { label: 'Rocket Meals Server', component: RocketMealsTile },
}

type ControlDef = { label: string; icon: React.ReactNode; dx: number; dy: number; isResize: boolean }

const TILE_CONTROLS: ControlDef[] = [
  { label: 'Move left',  icon: <ArrowBackIcon fontSize="inherit" />,           dx: -1, dy:  0, isResize: false },
  { label: 'Move right', icon: <ArrowForwardIcon fontSize="inherit" />,        dx:  1, dy:  0, isResize: false },
  { label: 'Move up',    icon: <ArrowUpwardIcon fontSize="inherit" />,         dx:  0, dy: -1, isResize: false },
  { label: 'Move down',  icon: <ArrowDownwardIcon fontSize="inherit" />,       dx:  0, dy:  1, isResize: false },
  { label: 'Wider',      icon: <AddCircleOutlineIcon fontSize="inherit" />,    dx:  1, dy:  0, isResize: true  },
  { label: 'Narrower',   icon: <RemoveCircleOutlineIcon fontSize="inherit" />, dx: -1, dy:  0, isResize: true  },
  { label: 'Taller',     icon: <AddCircleOutlineIcon fontSize="inherit" />,    dx:  0, dy:  1, isResize: true  },
  { label: 'Shorter',    icon: <RemoveCircleOutlineIcon fontSize="inherit" />, dx:  0, dy: -1, isResize: true  },
]

function DraggableTile({
  tile,
  editMode,
}: {
  tile: TileInstance
  editMode: boolean
}) {
  const { updateTile, removeTile } = useStore()
  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: tile.id,
    disabled: !editMode,
  })

  const style: React.CSSProperties = {
    gridColumn: `${tile.x + 1} / span ${tile.w}`,
    gridRow: `${tile.y + 1} / span ${tile.h}`,
    transform: transform ? CSS.Translate.toString(transform) : undefined,
    position: 'relative',
    display: tile.hidden && !editMode ? 'none' : undefined,
    opacity: tile.hidden ? 0.4 : 1,
  }

  const move = (dx: number, dy: number) => {
    const nx = Math.max(0, Math.min(GRID_COLS - tile.w, tile.x + dx))
    const ny = Math.max(0, Math.min(GRID_ROWS - tile.h, tile.y + dy))
    updateTile(tile.id, { x: nx, y: ny })
  }

  const resize = (dw: number, dh: number) => {
    const nw = Math.max(1, Math.min(GRID_COLS - tile.x, tile.w + dw))
    const nh = Math.max(1, Math.min(GRID_ROWS - tile.y, tile.h + dh))
    updateTile(tile.id, { w: nw, h: nh })
  }

  const TileComp = tileRegistry[tile.type]?.component ?? SampleTile

  return (
    <Box ref={setNodeRef} style={style}>
      <Box
        sx={{ height: '100%', cursor: editMode ? 'grab' : 'default' }}
        {...(editMode ? { ...listeners, ...attributes } : {})}
      >
        <TileComp tile={tile} />
      </Box>
      {editMode && (
        <Box
          sx={{
            position: 'absolute',
            bottom: 4,
            right: 4,
            display: 'flex',
            flexWrap: 'wrap',
            gap: 0.25,
            backgroundColor: 'background.paper',
            borderRadius: 1,
            p: 0.5,
            zIndex: 10,
            maxWidth: 160,
          }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {TILE_CONTROLS.map(({ label, icon, dx, dy, isResize }) => (
            <Tooltip key={label} title={label}>
              <IconButton
                size="small"
                onClick={() => isResize ? resize(dx, dy) : move(dx, dy)}
              >{icon}</IconButton>
            </Tooltip>
          ))}
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
      )}
    </Box>
  )
}

export default function DashboardScreen() {
  const { tiles, editMode, toggleEditMode, addTile, updateTile } = useStore()
  const [addOpen, setAddOpen] = useState(false)
  const theme = useTheme()

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, delta } = event
    const tile = tiles.find((t) => t.id === active.id)
    if (!tile) return
    const gridEl = document.getElementById('dashboard-grid')
    if (!gridEl) return
    const cellW = gridEl.clientWidth / GRID_COLS
    const cellH = gridEl.clientHeight / GRID_ROWS
    const dx = Math.round(delta.x / cellW)
    const dy = Math.round(delta.y / cellH)
    if (dx === 0 && dy === 0) return
    const nx = Math.max(0, Math.min(GRID_COLS - tile.w, tile.x + dx))
    const ny = Math.max(0, Math.min(GRID_ROWS - tile.h, tile.y + dy))
    updateTile(tile.id, { x: nx, y: ny })
  }

  return (
    <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Top bar */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', px: 2, py: 1, flexShrink: 0 }}>
        <Tooltip title={editMode ? 'Exit edit mode' : 'Edit mode'}>
          <IconButton onClick={toggleEditMode} color={editMode ? 'primary' : 'default'}>
            <SettingsIcon />
          </IconButton>
        </Tooltip>
      </Box>

      {/* Grid area */}
      <Box sx={{ flex: 1, px: 2, pb: 2, overflow: 'hidden' }}>
        <Box
          sx={{
            width: '100%',
            aspectRatio: '32 / 18',
            maxHeight: '100%',
            margin: '0 auto',
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
                gridTemplateColumns: `repeat(${GRID_COLS}, 1fr)`,
                gridTemplateRows: `repeat(${GRID_ROWS}, 1fr)`,
                width: '100%',
                height: '100%',
                gap: 0.5,
              }}
            >
              {tiles.map((tile) => (
                <DraggableTile key={tile.id} tile={tile} editMode={editMode} />
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
