'use client'

import { Component, type ErrorInfo, type ReactNode } from 'react'
import { useI18n } from '@/control/i18n'

function Crashed({ onRetry }: { onRetry: () => void }) {
  const { t } = useI18n()
  return (
    <div role="alert" className="card grid gap-3 p-5" data-testid="boundary-fallback">
      <p className="text-body">{t('boundaryMessage')}</p>
      <button type="button" className="btn btn-outline justify-self-start" onClick={onRetry}>
        {t('retry')}
      </button>
    </div>
  )
}

interface Props {
  resetKey: string
  children: ReactNode
}

export class ErrorBoundary extends Component<Props, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(error, info.componentStack)
  }

  componentDidUpdate(previous: Props) {
    if (this.state.failed && previous.resetKey !== this.props.resetKey) this.setState({ failed: false })
  }

  render() {
    if (this.state.failed) return <Crashed onRetry={() => this.setState({ failed: false })} />
    return this.props.children
  }
}
