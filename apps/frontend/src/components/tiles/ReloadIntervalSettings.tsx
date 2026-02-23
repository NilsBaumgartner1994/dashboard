import {
  Divider,
  FormControlLabel,
  Switch,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material'

interface ReloadIntervalSettingsProps {
  /** Current reload interval in minutes. */
  intervalMinutes: 1 | 5 | 60
  onIntervalChange: (v: 1 | 5 | 60) => void
  /** Whether the progress bar is shown. */
  showBar: boolean
  onShowBarChange: (v: boolean) => void
  /** Whether "Zuletzt aktualisiert" timestamp is shown inside the bar. */
  showLastUpdate: boolean
  onShowLastUpdateChange: (v: boolean) => void
  /** Section title (shown in a Divider). */
  label?: string
}

export default function ReloadIntervalSettings({
  intervalMinutes,
  onIntervalChange,
  showBar,
  onShowBarChange,
  showLastUpdate,
  onShowLastUpdateChange,
  label = 'Aktualisierungsintervall',
}: ReloadIntervalSettingsProps) {
  return (
    <>
      <Divider sx={{ mb: 2 }}>{label}</Divider>
      <Typography variant="body2" sx={{ mb: 1 }}>Intervall</Typography>
      <ToggleButtonGroup
        value={intervalMinutes}
        exclusive
        onChange={(_, val) => { if (val) onIntervalChange(val as 1 | 5 | 60) }}
        size="small"
        sx={{ mb: 2 }}
      >
        <ToggleButton value={1}>1 min</ToggleButton>
        <ToggleButton value={5}>5 min</ToggleButton>
        <ToggleButton value={60}>60 min</ToggleButton>
      </ToggleButtonGroup>
      <FormControlLabel
        control={<Switch checked={showBar} onChange={(e) => onShowBarChange(e.target.checked)} />}
        label="Fortschrittsbalken anzeigen"
        sx={{ display: 'block', mb: 1 }}
      />
      <FormControlLabel
        control={<Switch checked={showLastUpdate} onChange={(e) => onShowLastUpdateChange(e.target.checked)} />}
        label="Letzte Aktualisierung anzeigen"
        sx={{ display: 'block', mb: 1 }}
      />
    </>
  )
}
