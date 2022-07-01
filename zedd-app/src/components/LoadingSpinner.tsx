import * as React from 'react'
import CircularProgress, { CircularProgressProps } from '@mui/material/CircularProgress'
import Typography from '@mui/material/Typography'
import Box from '@mui/material/Box'
import { green, red } from '@mui/material/colors'
import { Close as CloseIcon, Check as CheckIcon } from '@mui/icons-material'

interface ILoadingSpinner extends CircularProgressProps {
  loading: boolean
  value?: number
  success: boolean
  error: boolean
}

export function LoadingSpinner(props: ILoadingSpinner) {
  if (!props.success && !props.error && !props.loading) {
    return null
  }

  return (
    <Box sx={{ position: 'relative', display: 'inline-flex' }}>
      {props.loading && (
        <>
          <CircularProgress color='warning' thickness={5} {...props} />
          {props.value && (
            <Box
              sx={{
                top: 0,
                left: 0,
                bottom: 0,
                right: 0,
                position: 'absolute',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Typography variant='caption' component='div' color='text.secondary'>
                {`${Math.round(props.value)}%`}
              </Typography>
            </Box>
          )}
        </>
      )}
      {props.success && <CheckIcon sx={{ color: green[700] }} />}
      {props.error && <CloseIcon sx={{ color: red[700] }} />}
    </Box>
  )
}
