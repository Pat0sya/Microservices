// Helper to get auth headers
export function getAuthHeaders(token: string) {
  return {
    'authorization': `Bearer ${token}`,
    'content-type': 'application/json',
  }
}

