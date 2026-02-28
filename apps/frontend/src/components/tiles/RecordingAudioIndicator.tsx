import { Box, Chip } from '@mui/material'

interface RecordingAudioIndicatorProps {
  level: number
  activeThreshold?: number
}

export default function RecordingAudioIndicator({ level, activeThreshold = 0.08 }: RecordingAudioIndicatorProps) {
  const barCount = 18
  const isAudioActive = level >= activeThreshold

  return (
    <Box>
      <Chip
        size="small"
        color={isAudioActive ? 'success' : 'default'}
        label={isAudioActive ? 'Ton erkannt' : 'Warte auf Ton'}
        sx={{ mb: 0.5 }}
      />
      <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: '2px', height: 30 }}>
        {Array.from({ length: barCount }).map((_, index) => {
          const wave = Math.abs(Math.sin((index / barCount) * Math.PI * 2))
          const normalized = Math.min(1, level * (0.65 + wave * 0.7))
          const height = 4 + normalized * 24

          return (
            <Box
              key={index}
              sx={{
                width: 4,
                height,
                borderRadius: 999,
                transition: 'height 120ms ease-out, opacity 120ms ease-out',
                bgcolor: 'error.main',
                opacity: 0.25 + normalized * 0.75,
              }}
            />
          )
        })}
      </Box>
    </Box>
  )
}
