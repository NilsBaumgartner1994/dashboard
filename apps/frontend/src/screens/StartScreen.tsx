import { Box, Button, Typography } from '@mui/material'
import { useNavigate } from 'react-router-dom'

export default function StartScreen() {
  const navigate = useNavigate()
  return (
    <Box
      sx={{
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 3,
      }}
    >
      <Typography variant="h3" fontWeight="bold">
        Welcome
      </Typography>
      <Button variant="contained" size="large" onClick={() => navigate('/dashboard')}>
        Dashboard
      </Button>
    </Box>
  )
}
