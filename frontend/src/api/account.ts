import { get, post } from './client'
import type { AccountResponse, LibraryResponse } from './types'

export async function authenticateWithTelegram(initData: string): Promise<AccountResponse> {
  return post<AccountResponse>('/v1/auth/telegram', { init_data: initData })
}

export async function getCurrentAccount(): Promise<AccountResponse> {
  return get<AccountResponse>('/v1/me')
}

export async function getLibrary(limit = 50): Promise<LibraryResponse> {
  return get<LibraryResponse>('/v1/me/library', { limit })
}

export async function logout(): Promise<void> {
  await post<void>('/v1/auth/logout')
}
