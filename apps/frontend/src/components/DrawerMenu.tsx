import { useState } from 'react'
import {
  Drawer,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  IconButton,
  Box,
} from '@mui/material'
import MenuIcon from '@mui/icons-material/Menu'
import HomeIcon from '@mui/icons-material/Home'
import DashboardIcon from '@mui/icons-material/Dashboard'
import SettingsIcon from '@mui/icons-material/Settings'
import { useNavigate } from 'react-router-dom'

const navItems = [
  { label: 'Start', icon: <HomeIcon />, path: '/' },
  { label: 'Dashboard', icon: <DashboardIcon />, path: '/dashboard' },
  { label: 'Settings', icon: <SettingsIcon />, path: '/settings' },
]

export default function DrawerMenu() {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()

  return (
    <>
      <IconButton
        onClick={() => setOpen(true)}
        sx={{ position: 'fixed', top: 8, left: 8, zIndex: 1300 }}
        color="inherit"
        aria-label="open menu"
      >
        <MenuIcon />
      </IconButton>
      <Drawer anchor="left" open={open} onClose={() => setOpen(false)}>
        <Box sx={{ width: 220 }} role="presentation">
          <List sx={{ pt: 7 }}>
            {navItems.map((item) => (
              <ListItem key={item.path} disablePadding>
                <ListItemButton
                  onClick={() => {
                    navigate(item.path)
                    setOpen(false)
                  }}
                >
                  <ListItemIcon>{item.icon}</ListItemIcon>
                  <ListItemText primary={item.label} />
                </ListItemButton>
              </ListItem>
            ))}
          </List>
        </Box>
      </Drawer>
    </>
  )
}
