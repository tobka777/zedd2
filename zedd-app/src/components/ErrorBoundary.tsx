import * as React from 'react'
import { Component } from 'react'
import { TextField } from '@material-ui/core'

export class ErrorBoundary extends Component {
  state = { error: undefined as any }

  constructor(props: {}) {
    super(props)
  }

  static getDerivedStateFromError(error: Error) {
    // Update state so the next render will show the fallback UI.
    return { error }
  }
  componentDidCatch(error: Error, errorInfo: any) {
    // You can also log the error to an error reporting service
    console.error(error, errorInfo)
    // logErrorToMyService(error, errorInfo)
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 16, width: '100%' }}>
          <h2>An Error Occurred!</h2>
          <TextField
            value={this.state.error.stack}
            multiline
            InputProps={{
              readOnly: true,
            }}
            error
            style={{ color: 'red', width: '100%' }}
            variant='outlined'
          />
        </div>
      )
    }
    return this.props.children
  }
}
