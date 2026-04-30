import { pipeline, type FeatureExtractionPipeline } from '@huggingface/transformers'
import type { EmbeddingBlob } from '@mnemosyne/types'
import type { ComputeClient } from './client.js'

let _embedder: FeatureExtractionPipeline | null = null

async function getEmbedder(): Promise<FeatureExtractionPipeline> {
  if (!_embedder) {
    _embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2') as FeatureExtractionPipeline
  }
  return _embedder
}

export async function generateEmbedding(
  _client: ComputeClient,
  entryId: string,
  content: string,
): Promise<EmbeddingBlob> {
  const embedder = await getEmbedder()
  const output = await embedder(content, { pooling: 'mean', normalize: true })
  const vector = Array.from(output.data as Float32Array)

  return {
    entryId,
    model: 'Xenova/all-MiniLM-L6-v2',
    vector,
    dimensions: vector.length,
  }
}
