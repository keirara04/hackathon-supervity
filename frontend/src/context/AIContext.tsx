'use client'

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
import { usePathname } from 'next/navigation'

// crypto.randomUUID() only exists in secure contexts (HTTPS or localhost) —
// throws on plain-HTTP deployments (e.g. a bare IP with no TLS). generateId()
// works everywhere; it doesn't need to be cryptographically unique, just
// unique enough for React keys within one session.
function generateId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

// ============================================================================
// Types
// ============================================================================

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
  isLoading?: boolean
  toolCalls?: Array<{ id: string; name: string; args: Record<string, unknown>; result?: unknown }>
}

interface AIContextValue {
  // Manager state
  isManagerOpen: boolean
  openManager: () => void
  closeManager: () => void
  toggleManager: () => void

  // Chat
  chatHistory: ChatMessage[]
  addMessage: (msg: Omit<ChatMessage, 'id' | 'timestamp'>) => void
  clearHistory: () => void

  // Typing indicator
  isTyping: boolean
  setIsTyping: (v: boolean) => void

  // Page context
  currentPageContext: string

  // Suggestions
  hasPendingSuggestions: boolean
}

// ============================================================================
// Context
// ============================================================================

const AIContext = createContext<AIContextValue | null>(null)

export function useAI(): AIContextValue {
  const ctx = useContext(AIContext)
  if (!ctx) {
    throw new Error('useAI must be used within an AIProvider')
  }
  return ctx
}

// ============================================================================
// Provider
// ============================================================================

export function AIProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const [isManagerOpen, setIsManagerOpen] = useState(false)
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([])
  const [isTyping, setIsTyping] = useState(false)

  const openManager = useCallback(() => setIsManagerOpen(true), [])
  const closeManager = useCallback(() => setIsManagerOpen(false), [])
  const toggleManager = useCallback(() => setIsManagerOpen(prev => !prev), [])

  const addMessage = useCallback((msg: Omit<ChatMessage, 'id' | 'timestamp'>) => {
    // If this is a non-loading assistant message, replace the last loading message
    setChatHistory(prev => {
      if (msg.role === 'assistant' && !msg.isLoading) {
        const withoutLoading = prev.filter(m => !m.isLoading)
        return [
          ...withoutLoading,
          { ...msg, id: generateId(), timestamp: new Date() },
        ]
      }
      return [
        ...prev,
        { ...msg, id: generateId(), timestamp: new Date() },
      ]
    })
  }, [])

  const clearHistory = useCallback(() => setChatHistory([]), [])

  return (
    <AIContext.Provider
      value={{
        isManagerOpen,
        openManager,
        closeManager,
        toggleManager,
        chatHistory,
        addMessage,
        clearHistory,
        isTyping,
        setIsTyping,
        currentPageContext: pathname,
        hasPendingSuggestions: false,
      }}
    >
      {children}
    </AIContext.Provider>
  )
}
