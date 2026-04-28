import { describe, it, expect } from 'vitest'
import { createComputeClient } from '../client.js'

const PRIVATE_KEY = process.env['ZG_PRIVATE_KEY']
const RUN = !!PRIVATE_KEY

describe('createComputeClient', () => {
  it('initializes broker and finds a service', { skip: !RUN }, async () => {
    const client = await createComputeClient({ privateKey: PRIVATE_KEY! })
    expect(client.broker).toBeDefined()
    expect(client.service.providerAddress).toBeTruthy()
    expect(client.service.endpoint).toBeTruthy()
    expect(client.service.model).toBeTruthy()
    console.log('Service found:', client.service)
  })
})
