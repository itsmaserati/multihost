'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Cookies from 'js-cookie'
import { api } from '@/lib/api'

interface User {
  id: string
  email: string
  name: string
  type: 'global_admin' | 'tenant_admin' | 'user'
  tenantId?: string
  has2FA: boolean
}

interface AuthContextType {
  user: User | null
  login: (email: string, password: string, userType?: string, twoFaCode?: string) => Promise<void>
  logout: () => void
  isLoading: boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    checkAuth()
  }, [])

  const checkAuth = async () => {
    try {
      const token = Cookies.get('access_token')
      if (!token) {
        setIsLoading(false)
        return
      }

      const response = await api.get('/auth/me')
      setUser(response.data)
    } catch (error) {
      Cookies.remove('access_token')
      Cookies.remove('refresh_token')
    } finally {
      setIsLoading(false)
    }
  }

  const login = async (email: string, password: string, userType = 'global_admin', twoFaCode?: string) => {
    const response = await api.post('/auth/login', {
      email,
      password,
      userType,
      twoFaCode,
    })

    const { accessToken, refreshToken, user: userData } = response.data

    Cookies.set('access_token', accessToken, { expires: 1 }) // 1 day
    Cookies.set('refresh_token', refreshToken, { expires: 7 }) // 7 days

    setUser(userData)

    // Redirect based on user type
    if (userData.type === 'global_admin') {
      router.push('/admin')
    } else if (userData.type === 'tenant_admin') {
      router.push('/tenant')
    } else {
      router.push('/user')
    }
  }

  const logout = async () => {
    try {
      await api.post('/auth/logout')
    } catch (error) {
      // Ignore errors during logout
    }

    Cookies.remove('access_token')
    Cookies.remove('refresh_token')
    setUser(null)
    router.push('/admin/login')
  }

  return (
    <AuthContext.Provider value={{ user, login, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}