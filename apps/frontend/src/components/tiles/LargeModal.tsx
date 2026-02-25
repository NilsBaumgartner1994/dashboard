import MyModal from './MyModal'
import type { ReactNode } from 'react'

interface LargeModalProps {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
}

export default function LargeModal({ open, onClose, title, children }: LargeModalProps) {
  return (
    <MyModal open={open} onClose={onClose} title={title}>
      {children}
    </MyModal>
  )
}
