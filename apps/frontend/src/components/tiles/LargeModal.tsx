import {
  Dialog,
  DialogTitle,
  DialogContent,
  Box,
  Tooltip,
  IconButton,
} from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import type { ReactNode } from 'react'

interface LargeModalProps {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
}

export default function LargeModal({ open, onClose, title, children }: LargeModalProps) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth={false}
      PaperProps={{
        sx: {
          width: '100%',
          maxWidth: '100%',
          height: '80vh',
          m: 0,
          borderRadius: '16px 16px 0 0',
        },
      }}
      sx={{ '& .MuiDialog-container': { alignItems: 'flex-end' } }}
    >
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', pr: 1 }}>
        <Box sx={{ flex: 1 }}>{title}</Box>
        <Tooltip title="Schließen">
          <IconButton size="small" onClick={onClose}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </DialogTitle>
      <DialogContent dividers sx={{ display: 'flex', flexDirection: 'column', p: 0, overflow: 'hidden' }}>
        {children}
      </DialogContent>
    </Dialog>
  )
}
