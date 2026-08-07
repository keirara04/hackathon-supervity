'use client'

import React from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Icons } from '@/components/ui/icons'

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

/**
 * Catches render-time errors (e.g. a malformed API response shape) that a
 * page's own fetch try/catch wouldn't — those only guard the fetch, not
 * what happens when the component tries to render the result.
 */
export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <Card className='border-red-500/40 bg-red-500/5'>
          <CardContent className='flex flex-col items-center gap-3 py-10 text-center'>
            <Icons.alertTriangle className='h-8 w-8 text-red-400' />
            <p className='text-sm font-medium text-red-400'>Something went wrong rendering this page</p>
            <p className='max-w-md text-xs text-muted-foreground'>{this.state.error?.message}</p>
            <Button variant='outline' size='sm' onClick={() => this.setState({ hasError: false, error: null })}>
              <Icons.refresh className='mr-2 h-4 w-4' />
              Try again
            </Button>
          </CardContent>
        </Card>
      )
    }

    return this.props.children
  }
}
