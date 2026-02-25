import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Box,
  Tooltip,
  IconButton,
} from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import type { ReactNode } from 'react'

interface MyModalProps {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  actions?: ReactNode
  titleActions?: ReactNode
  maxHeight?: string
}

export default function MyModal({ open, onClose, title, children, actions, titleActions, maxHeight = '80vh' }: MyModalProps) {
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
          height: maxHeight,
          m: 0,
          borderRadius: '16px 16px 0 0',
        },
      }}
      sx={{ '& .MuiDialog-container': { alignItems: 'flex-end' } }}
    >
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', pr: 1 }}>
        <Box sx={{ flex: 1 }}>{title}</Box>
        {titleActions}
        <Tooltip title="Schließen">
          <IconButton size="small" onClick={onClose}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </DialogTitle>
      <DialogContent dividers sx={{ display: 'flex', flexDirection: 'column', p: 0, overflow: 'auto' }}>
        {children}
      </DialogContent>
      {actions && <DialogActions>{actions}</DialogActions>}
    </Dialog>
  )
}
