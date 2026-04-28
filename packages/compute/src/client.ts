import { createZGComputeNetworkBroker } from '@0glabs/0g-serving-broker'
import { ethers } from 'ethers'

export const ZG_RPC_TESTNET = 'https://evmrpc-testnet.0g.ai'
export const ZG_RPC_MAINNET = 'https://evmrpc.0g.ai'

export interface ComputeService {
  providerAddress: string
  endpoint:        string
  model:           string
}

export interface ComputeClient {
  broker:  Awaited<ReturnType<typeof createZGComputeNetworkBroker>>
  service: ComputeService
}

export interface ComputeClientConfig {
  privateKey: string
  rpcUrl?:    string
}

export async function createComputeClient(
  config: ComputeClientConfig,
): Promise<ComputeClient> {
  const rpcUrl   = config.rpcUrl ?? ZG_RPC_TESTNET
  const provider = new ethers.JsonRpcProvider(rpcUrl)
  const wallet   = new ethers.Wallet(config.privateKey, provider)
  const broker   = await createZGComputeNetworkBroker(wallet)

  // ensure the ledger account exists; create it with minimum balance if not
  try {
    await broker.ledger.getLedger()
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    if (
      msg.includes('LedgerNotExists') ||
      msg.includes('AccountNotExists') ||
      msg.includes('not found') ||
      msg.toLowerCase().includes('does not exist') ||
      msg.toLowerCase().includes('add-account')
    ) {
      // 3 0G is the minimum required to create a ledger
      await broker.ledger.addLedger(3)
    } else {
      throw err
    }
  }

  // pick the first available chat inference service
  const services = await broker.inference.listService()
  if (!services || services.length === 0) {
    throw new Error('No 0G Compute inference services available')
  }

  const svc = services[0]!
  const { endpoint, model } = await broker.inference.getServiceMetadata(svc.provider)

  return {
    broker,
    service: {
      providerAddress: svc.provider,
      endpoint,
      model,
    },
  }
}
