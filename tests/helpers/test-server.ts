import Fastify, { FastifyInstance } from 'fastify'
import { afterAll, beforeAll } from 'vitest'

export interface TestServer {
  server: FastifyInstance
  baseUrl: string
  close: () => Promise<void>
}

export async function createTestServer(
  serviceFactory: () => Promise<FastifyInstance>,
  port: number = 0
): Promise<TestServer> {
  const server = await serviceFactory()
  const address = await server.listen({ port, host: '127.0.0.1' })
  
  return {
    server,
    baseUrl: `http://${address}`,
    close: async () => {
      await server.close()
    },
  }
}

export function setupTestServer(
  serviceFactory: () => Promise<FastifyInstance>,
  port: number = 0
) {
  let testServer: TestServer | null = null

  beforeAll(async () => {
    testServer = await createTestServer(serviceFactory, port)
  })

  afterAll(async () => {
    if (testServer) {
      await testServer.close()
    }
  })

  return () => testServer
}

