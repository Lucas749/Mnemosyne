'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useReadContracts, useAccount } from 'wagmi'
import { parseEther, formatEther } from 'viem'
import { Tag, Modal, BtnPrimary, BtnGhost } from '@/components/design-system'
import { T } from '@/components/design-system'
import { REGISTRY_ADDRESS, REGISTRY_ABI, STATUS_LABELS } from '@/lib/contracts'
import { zgTestnet } from '@/lib/chains'
import { entryEns } from '@/lib/entry-name'
import { formatA0GI } from '@/lib/ens'
import { fetchMarketListings, buyListing, listForSale, cancelListing } from '@/lib/api'

type Listing = {
  tokenId: string
  seller: string
  price: string
}

type EntryData = {
  id: `0x${string}`; storageRef: string; embeddingRef: string; tags: string[]
  domain: number; submitter: `0x${string}`; stakeAmount: bigint; status: number
  submittedAt: bigint; challengeWindowEnd: bigint; queryCount: bigint
  royaltiesEarned: bigint; lastQueriedAt: bigint; inftTokenId: bigint
}

const API = process.env.NEXT_PUBLIC_API_URL ?? 'https://mnemosyne-api-production-7cd6.up.railway.app'

export default function MarketplacePage() {
  const { address } = useAccount()
  const [sort, setSort] = useState<'price' | 'newest'>('price')
  const [buyModal, setBuyModal] = useState<Listing | null>(null)
  const [listModal, setListModal] = useState(false)
  const [listPrice, setListPrice] = useState('')
  const [listTokenId, setListTokenId] = useState('')
  const [txHash, setTxHash] = useState<string | null>(null)
  const [txError, setTxError] = useState<string | null>(null)
  const [activating, setActivating] = useState<string | null>(null)
  const [listings, setListings] = useState<Listing[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isError, setIsError] = useState(false)
  const [actionPending, setActionPending] = useState(false)

  // Fetch wallet's submitted entries to show as owned knowledge NFTs
  const { data: walletEntryIds } = useReadContracts({
    contracts: address ? [
      { address: REGISTRY_ADDRESS, abi: REGISTRY_ABI, functionName: 'getSubmitterEntries', args: [address], chainId: zgTestnet.id },
    ] : [],
  })
  const myEntryIds = walletEntryIds?.[0]?.result as `0x${string}`[] | undefined

  const { data: myEntriesData } = useReadContracts({
    contracts: (myEntryIds ?? []).slice(0, 20).map(id => ({
      address: REGISTRY_ADDRESS, abi: REGISTRY_ABI,
      functionName: 'getEntry', args: [id], chainId: zgTestnet.id,
    })),
  })
  const myEntries: EntryData[] = (myEntriesData ?? [])
    .map(d => d.result as unknown as EntryData)
    .filter(Boolean)

  const loadListings = async () => {
    setIsLoading(true)
    setIsError(false)
    try {
      const data = await fetchMarketListings()
      setListings(data.listings)
    } catch {
      setIsError(true)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadListings()
  }, [])

  const sorted = [...listings].sort((a, b) => {
    if (sort === 'price') return BigInt(a.price) < BigInt(b.price) ? -1 : 1
    return BigInt(a.tokenId) < BigInt(b.tokenId) ? 1 : -1
  })

  async function handleActivate(entryId: string) {
    setActivating(entryId)
    try {
      const res = await fetch(`${API}/activate/${entryId}`, { method: 'POST' })
      const data = await res.json()
      if (data.inftTokenId && data.inftTokenId !== '0') {
        setTxHash(`Activated — iNFT #${data.inftTokenId}`)
      } else {
        setTxError('Activation returned no token ID — challenge window may not have passed yet.')
      }
    } catch (e) {
      setTxError('Activation request failed')
    } finally {
      setActivating(null)
    }
  }

  async function handleBuy(listing: Listing) {
    if (!address) return
    setTxError(null)
    setActionPending(true)
    try {
      const result = await buyListing(listing.tokenId, address, listing.price)
      setTxHash(result.txHash)
      setBuyModal(null)
      await loadListings()
    } catch (err) {
      setTxError((err as Error).message)
    } finally {
      setActionPending(false)
    }
  }

  async function handleList() {
    if (!address || !listTokenId || !listPrice) return
    setTxError(null)
    setActionPending(true)
    try {
      const result = await listForSale(listTokenId, address, parseEther(listPrice).toString())
      setTxHash(result.txHash)
      setListModal(false)
      setListPrice('')
      setListTokenId('')
      await loadListings()
    } catch (err) {
      setTxError((err as Error).message)
    } finally {
      setActionPending(false)
    }
  }

  async function handleCancel(tokenId: string) {
    setTxError(null)
    setActionPending(true)
    try {
      const result = await cancelListing(tokenId)
      setTxHash(result.txHash)
      await loadListings()
    } catch (err) {
      setTxError((err as Error).message)
    } finally {
      setActionPending(false)
    }
  }

  return (
    <div style={{ padding: '32px 40px', fontFamily: T.codeFont }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, color: T.text, margin: '0 0 4px', borderBottom: `1px solid ${T.border}`, paddingBottom: 6 }}>
        iNFT Knowledge Market
      </h1>
      <p style={{ fontSize: 11, color: T.muted, marginBottom: 24 }}>
        Buy and sell knowledge royalty streams. Every entry is a Knowledge iNFT — owning it means owning the royalty rights.
      </p>

      {txHash && (
        <div style={{ background: T.successBg, border: `1px solid ${T.success}`, borderRadius: 3, padding: '10px 16px', marginBottom: 16, fontSize: 11, color: T.success }}>
          ✓ Transaction submitted: {txHash.slice(0, 22)}...
        </div>
      )}
      {txError && (
        <div style={{ background: T.dangerBg, border: `1px solid ${T.danger}`, borderRadius: 3, padding: '10px 16px', marginBottom: 16, fontSize: 11, color: T.danger }}>
          ✗ {txError}
        </div>
      )}

      {/* Wallet's knowledge NFTs */}
      {address && (
        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 3, marginBottom: 28, overflow: 'hidden' }}>
          <div style={{ background: T.faint, padding: '10px 20px', borderBottom: `1px solid ${T.border}`, fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', color: T.text, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>YOUR KNOWLEDGE iNFTs ({myEntries.length})</span>
            <button
              onClick={() => setListModal(true)}
              style={{ background: T.accentLight, border: `1px solid ${T.accent}`, borderRadius: 2, padding: '3px 10px', fontFamily: T.codeFont, fontSize: 9, color: T.accent, cursor: 'pointer' }}
            >
              + LIST FOR SALE
            </button>
          </div>
          {myEntries.length === 0 ? (
            <div style={{ padding: '16px 20px', fontSize: 11, color: T.muted }}>
              {myEntryIds === undefined ? 'Loading your entries...' : 'No submitted entries found. Submit a fact to create a Knowledge iNFT.'}
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 0 }}>
              {myEntries.map(e => {
                const name = entryEns(e.id)
                const knowledgeTags = e.tags.filter(t => !['factual','labeled_example','structured_data','observation','correction'].includes(t.toLowerCase()))
                const isListed = listings.some(l => BigInt(l.tokenId) === e.inftTokenId && e.inftTokenId > 0n)
                return (
                  <div key={e.id} style={{ borderRight: `1px solid ${T.borderLight}`, borderBottom: `1px solid ${T.borderLight}`, padding: '14px 16px' }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: T.accent, marginBottom: 4 }}>
                      <Link href={`/entry/${e.id}`} style={{ color: T.accent, textDecoration: 'none' }}>{name}</Link>
                    </div>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 8 }}>
                      {knowledgeTags.slice(0, 3).map(t => (
                        <span key={t} style={{ fontSize: 8, color: T.muted, background: T.faint, border: `1px solid ${T.borderLight}`, borderRadius: 2, padding: '1px 5px' }}>{t}</span>
                      ))}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 9, color: e.status === 1 ? T.success : T.warning }}>
                        {STATUS_LABELS[e.status] ?? 'PENDING'}
                      </span>
                      <span style={{ fontSize: 10, color: T.text, fontWeight: 700 }}>{formatA0GI(e.stakeAmount)} A0GI</span>
                    </div>
                    {e.inftTokenId === 0n && (
                      <button
                        onClick={() => handleActivate(e.id)}
                        disabled={activating === e.id}
                        style={{ marginTop: 8, width: '100%', background: 'none', border: `1px solid ${T.accent}`, borderRadius: 2, padding: '4px 8px', fontFamily: T.codeFont, fontSize: 9, color: T.accent, cursor: 'pointer', letterSpacing: '0.08em' }}
                      >
                        {activating === e.id ? 'ACTIVATING...' : 'ACTIVATE iNFT →'}
                      </button>
                    )}
                    {isListed && (
                      <div style={{ marginTop: 6, fontSize: 9, color: T.accent }}>● LISTED FOR SALE</div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Market listings */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 20, alignItems: 'center', flexWrap: 'wrap' }}>
        <h2 style={{ fontSize: 14, fontWeight: 700, color: T.text, margin: 0 }}>Market Listings</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 16 }}>
          <span style={{ fontSize: 9, color: T.muted, letterSpacing: '0.1em' }}>SORT</span>
          <select value={sort} onChange={e => setSort(e.target.value as 'price' | 'newest')} style={{ background: T.bg, border: `1px solid ${T.border}`, borderRadius: 3, padding: '5px 10px', fontFamily: T.codeFont, fontSize: 10, color: T.text }}>
            <option value="price">Cheapest</option>
            <option value="newest">Newest</option>
          </select>
        </div>
        <span style={{ fontSize: 10, color: T.muted }}>
          {isLoading ? 'Loading...' : `${listings.length} active listing${listings.length !== 1 ? 's' : ''}`}
        </span>
        {!address && (
          <span style={{ fontSize: 9, color: T.warning, marginLeft: 'auto' }}>Connect wallet to buy or list</span>
        )}
      </div>

      {isError && (
        <div style={{ background: T.warningBg, border: `1px solid ${T.tagBorder}`, borderRadius: 3, padding: '10px 16px', marginBottom: 16, fontSize: 11, color: T.warning }}>
          ⚠ Could not read market contract — contract may not be deployed yet.
        </div>
      )}

      {!isLoading && !isError && listings.length === 0 && (
        <div style={{ fontSize: 11, color: T.muted, textAlign: 'center', padding: '48px 0', background: T.surface, border: `1px solid ${T.border}`, borderRadius: 3 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: T.text, marginBottom: 8 }}>No Active Listings</div>
          <div style={{ marginBottom: 20 }}>Be the first to list a Knowledge iNFT for sale.</div>
          {address ? (
            <BtnPrimary onClick={() => setListModal(true)}>+ LIST YOUR iNFT</BtnPrimary>
          ) : (
            <span style={{ fontSize: 10, color: T.muted }}>Connect wallet to list</span>
          )}
        </div>
      )}

      {sorted.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 18 }}>
          {sorted.map(l => {
            const isOwn = l.seller.toLowerCase() === address?.toLowerCase()
            // Try to find the entry for this token ID
            const matchedEntry = myEntries.find(e => e.inftTokenId === BigInt(l.tokenId))
            const displayName = matchedEntry ? entryEns(matchedEntry.id) : `iNFT #${l.tokenId}`
            return (
              <div key={l.tokenId} style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 4, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                <div style={{ background: T.faint, padding: '10px 16px', borderBottom: `1px solid ${T.borderLight}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: T.accent }}>{displayName}</span>
                  {isOwn && <Tag variant="warning">YOURS</Tag>}
                </div>
                {matchedEntry && (
                  <div style={{ padding: '8px 16px 0', display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {matchedEntry.tags.filter(t => !['factual','labeled_example','structured_data','observation','correction'].includes(t.toLowerCase())).slice(0, 3).map(t => (
                      <span key={t} style={{ fontSize: 8, color: T.muted, background: T.faint, border: `1px solid ${T.borderLight}`, borderRadius: 2, padding: '1px 5px' }}>{t}</span>
                    ))}
                  </div>
                )}
                <div style={{ padding: '12px 16px', flex: 1 }}>
                  <div style={{ fontSize: 10, color: T.muted, marginBottom: 8 }}>Seller: {l.seller.slice(0, 14)}...</div>
                  <div style={{ fontSize: 16, color: T.accent, fontWeight: 700 }}>{formatEther(BigInt(l.price))} A0GI</div>
                </div>
                <div style={{ padding: '10px 16px', borderTop: `1px solid ${T.borderLight}`, display: 'flex', gap: 8 }}>
                  {isOwn ? (
                    <button onClick={() => handleCancel(l.tokenId)} disabled={actionPending} style={{ flex: 1, background: 'none', border: `1px solid ${T.danger}`, borderRadius: 3, padding: '8px', fontFamily: T.codeFont, fontSize: 9, color: T.danger, cursor: actionPending ? 'not-allowed' : 'pointer' }}>
                      CANCEL LISTING
                    </button>
                  ) : (
                    <button onClick={() => setBuyModal(l)} disabled={!address} style={{ flex: 1, background: address ? T.accent : T.muted, border: 'none', borderRadius: 3, padding: '8px', fontFamily: T.codeFont, fontSize: 9, letterSpacing: '0.08em', color: '#fff', cursor: address ? 'pointer' : 'not-allowed', fontWeight: 700 }}>
                      BUY NOW →
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {buyModal && (
        <Modal title="BUY iNFT" onClose={() => setBuyModal(null)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18, fontFamily: T.codeFont }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: T.accent }}>
              {myEntries.find(e => e.inftTokenId === BigInt(buyModal.tokenId)) ? entryEns(myEntries.find(e => e.inftTokenId === BigInt(buyModal.tokenId))!.id) : `iNFT #${buyModal.tokenId}`}
            </div>
            {[
              ['Seller', buyModal.seller.slice(0, 18) + '...'],
              ['Price', `${formatEther(BigInt(buyModal.price))} A0GI`],
            ].map(([k, v]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: `1px solid ${T.borderLight}`, paddingBottom: 8 }}>
                <span style={{ fontSize: 10, color: T.muted }}>{k}</span>
                <span style={{ fontSize: 11, color: T.text, fontWeight: 700 }}>{v}</span>
              </div>
            ))}
            <div style={{ background: T.faint, border: `1px solid ${T.border}`, borderRadius: 3, padding: '14px 16px' }}>
              <div style={{ fontSize: 9, color: T.muted, letterSpacing: '0.1em', marginBottom: 10 }}>WHAT YOU GET</div>
              {['Full royalty stream from future queries', 'Knowledge iNFT on 0G blockchain', 'Transferable ownership of the fact'].map(b => (
                <div key={b} style={{ fontSize: 11, color: T.text, marginBottom: 6 }}>✓ {b}</div>
              ))}
            </div>
            {txError && <div style={{ fontSize: 11, color: T.danger }}>{txError}</div>}
            {!address && <div style={{ fontSize: 11, color: T.danger }}>Connect your wallet to buy.</div>}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <BtnGhost onClick={() => setBuyModal(null)}>CANCEL</BtnGhost>
              <BtnPrimary onClick={() => handleBuy(buyModal)} disabled={!address || actionPending}>
                {actionPending ? 'PROCESSING...' : `BUY FOR ${formatEther(BigInt(buyModal.price))} A0GI →`}
              </BtnPrimary>
            </div>
          </div>
        </Modal>
      )}

      {listModal && (
        <Modal title="LIST iNFT FOR SALE" onClose={() => setListModal(false)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18, fontFamily: T.codeFont }}>
                  <div>
              <div style={{ fontSize: 10, color: T.muted, marginBottom: 8 }}>SELECT YOUR KNOWLEDGE iNFT</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 200, overflowY: 'auto', border: `1px solid ${T.border}`, borderRadius: 4, padding: 8 }}>
                {myEntries.length === 0 && (
                  <div style={{ fontSize: 10, color: T.muted, padding: '8px 4px' }}>No entries found — submit a fact first.</div>
                )}
                {myEntries.map(e => {
                  const name = entryEns(e.id)
                  const tokenId = e.inftTokenId > 0n ? e.inftTokenId.toString() : ''
                  const isSelected = listTokenId !== '' && (tokenId === listTokenId || e.id === listTokenId)
                  const knowledgeTags = e.tags.filter(t => !['factual','labeled_example','structured_data','observation','correction'].includes(t.toLowerCase()))
                  return (
                    <button key={e.id}
                      onClick={() => setListTokenId(tokenId || e.id)}
                      disabled={e.inftTokenId === 0n}
                      title={e.inftTokenId === 0n ? 'Entry must be verified and minted as iNFT before listing' : undefined}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                        background: isSelected ? T.accentLight : T.bg,
                        border: `1px solid ${isSelected ? T.accent : T.border}`,
                        borderRadius: 3, cursor: e.inftTokenId === 0n ? 'not-allowed' : 'pointer',
                        fontFamily: T.codeFont, textAlign: 'left', opacity: e.inftTokenId === 0n ? 0.5 : 1,
                      }}
                    >
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 12, color: T.accent, fontWeight: 700 }}>{name}</div>
                        <div style={{ fontSize: 9, color: T.muted, marginTop: 2 }}>
                          {knowledgeTags.slice(0, 3).join(' · ')}
                          {e.inftTokenId > 0n ? ` · iNFT #${e.inftTokenId}` : ' · PENDING MINT'}
                        </div>
                      </div>
                      {isSelected && <span style={{ fontSize: 10, color: T.accent }}>✓</span>}
                    </button>
                  )
                })}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: T.muted, marginBottom: 6 }}>ASKING PRICE (A0GI)</div>
              <input value={listPrice} onChange={e => setListPrice(e.target.value)} placeholder="0.2"
                style={{ width: '100%', background: T.bg, border: `1px solid ${T.border}`, borderRadius: 3, padding: '8px 12px', fontFamily: T.codeFont, fontSize: 16, color: T.text, boxSizing: 'border-box' }} />
              <div style={{ fontSize: 9, color: T.muted, marginTop: 6 }}>Royalties accrue to you while listed. If sold, future royalties go to buyer.</div>
            </div>
            {txError && <div style={{ fontSize: 11, color: T.danger }}>{txError}</div>}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <BtnGhost onClick={() => setListModal(false)}>CANCEL</BtnGhost>
              <BtnPrimary onClick={handleList} disabled={!address || !listTokenId || !listPrice || actionPending}>
                {actionPending ? 'PROCESSING...' : 'LIST FOR SALE →'}
              </BtnPrimary>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
