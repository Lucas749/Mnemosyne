'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { useAccount } from 'wagmi'
import { Tag, Modal, BtnPrimary, BtnGhost, ApiUnavailableBanner } from '@/components/design-system'
import { T } from '@/components/design-system'
import { fetchMarketListings, buyListing, listForSale, cancelListing, type MarketListing } from '@/lib/api'
import { parseEther, formatEther } from 'viem'

export default function MarketplacePage() {
  const { address } = useAccount()
  const [filter, setFilter] = useState('all')
  const [sort, setSort] = useState('price')
  const [buyModal, setBuyModal] = useState<MarketListing | null>(null)
  const [listModal, setListModal] = useState(false)
  const [listPrice, setListPrice] = useState('')
  const [listTokenId, setListTokenId] = useState('')
  const [actionStatus, setActionStatus] = useState<string | null>(null)

  const { data, error, isLoading, refetch } = useQuery({
    queryKey: ['market-listings'],
    queryFn: fetchMarketListings,
    retry: false,
  })

  const listings = data?.listings ?? []

  const sorted = [...listings].sort((a, b) => {
    if (sort === 'price') return Number(BigInt(a.price) - BigInt(b.price))
    return Number(b.tokenId) - Number(a.tokenId)
  })

  async function handleBuy(listing: MarketListing) {
    if (!address) return
    setActionStatus('Buying...')
    try {
      await buyListing(listing.tokenId, address, listing.price)
      setActionStatus('Purchased!')
      setBuyModal(null)
      refetch()
    } catch (e: unknown) {
      const err = e as { message?: string }
      setActionStatus(`Error: ${err.message}`)
    }
  }

  async function handleList() {
    if (!address || !listTokenId || !listPrice) return
    setActionStatus('Listing...')
    try {
      const priceWei = parseEther(listPrice).toString()
      await listForSale(listTokenId, address, priceWei)
      setActionStatus('Listed!')
      setListModal(false)
      refetch()
    } catch (e: unknown) {
      const err = e as { message?: string }
      setActionStatus(`Error: ${err.message}`)
    }
  }

  async function handleCancel(tokenId: string) {
    setActionStatus('Canceling...')
    try {
      await cancelListing(tokenId)
      setActionStatus('Canceled')
      refetch()
    } catch (e: unknown) {
      const err = e as { message?: string }
      setActionStatus(`Error: ${err.message}`)
    }
  }

  return (
    <div style={{ padding: '32px 40px', fontFamily: T.codeFont }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, color: T.text, margin: '0 0 4px', borderBottom: `1px solid ${T.border}`, paddingBottom: 6 }}>
        iNFT Knowledge Market
      </h1>
      <p style={{ fontSize: 11, color: T.muted, marginBottom: 24 }}>
        Buy and sell knowledge royalty streams. Owning an iNFT = owning the royalty rights to that knowledge.
      </p>

      {error && <ApiUnavailableBanner endpoint="GET /market/listings" />}
      {actionStatus && (
        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 3, padding: '10px 16px', marginBottom: 16, fontSize: 11, color: T.accent }}>
          {actionStatus}
        </div>
      )}

      {/* My iNFTs panel — requires wallet + API */}
      {address && !error && (
        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 3, marginBottom: 24, overflow: 'hidden' }}>
          <div style={{ background: T.faint, padding: '10px 20px', borderBottom: `1px solid ${T.border}`, fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', color: T.text, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>YOUR iNFTs</span>
            <button onClick={() => setListModal(true)} style={{ background: T.accentLight, border: `1px solid ${T.accent}`, borderRadius: 2, padding: '3px 10px', fontFamily: T.codeFont, fontSize: 9, color: T.accent, cursor: 'pointer' }}>
              + LIST NEW
            </button>
          </div>
          <div style={{ padding: '14px 20px', fontSize: 11, color: T.muted }}>
            Connect and load your iNFTs to manage listings.
          </div>
        </div>
      )}

      {/* Filter bar */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 20, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 9, color: T.muted, letterSpacing: '0.1em' }}>SORT</span>
          <select value={sort} onChange={e => setSort(e.target.value)} style={{ background: T.bg, border: `1px solid ${T.border}`, borderRadius: 3, padding: '5px 10px', fontFamily: T.codeFont, fontSize: 10, color: T.text }}>
            <option value="price">Cheapest</option>
            <option value="newest">Newest</option>
          </select>
        </div>
        {!error && (
          <span style={{ fontSize: 10, color: T.muted }}>
            {listings.length} active listing{listings.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {isLoading && (
        <div style={{ fontSize: 11, color: T.muted }}>Loading market listings...</div>
      )}

      {error && (
        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 3, padding: '40px', textAlign: 'center' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: T.text, marginBottom: 12 }}>Market Coming Soon</div>
          <div style={{ fontSize: 12, color: T.muted, marginBottom: 20, lineHeight: 1.8 }}>
            The iNFT marketplace requires backend API endpoints that are not yet deployed.<br />
            Build these endpoints to enable marketplace functionality:
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 320, margin: '0 auto', textAlign: 'left' }}>
            {[
              'GET /market/listings',
              'POST /market/list',
              'POST /market/buy',
              'DELETE /market/listing/:tokenId',
              'PATCH /market/listing/:tokenId',
            ].map(ep => (
              <code key={ep} style={{ fontSize: 11, background: T.faint, padding: '6px 12px', borderRadius: 3, color: T.accent, display: 'block', border: `1px solid ${T.border}` }}>
                {ep}
              </code>
            ))}
          </div>
        </div>
      )}

      {!error && !isLoading && listings.length === 0 && (
        <div style={{ fontSize: 11, color: T.muted, textAlign: 'center', padding: '40px 0' }}>
          No active listings.
        </div>
      )}

      {!error && sorted.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 18 }}>
          {sorted.map(l => (
            <div key={l.tokenId} style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 4, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <div style={{ background: T.faint, padding: '10px 16px', borderBottom: `1px solid ${T.borderLight}` }}>
                <Tag>iNFT #{l.tokenId}</Tag>
              </div>
              <div style={{ padding: '16px 16px 12px', flex: 1 }}>
                <div style={{ fontSize: 10, color: T.muted, marginBottom: 8 }}>Seller: {l.seller.slice(0, 14)}...</div>
                <div style={{ borderTop: `1px solid ${T.borderLight}`, paddingTop: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ fontSize: 9, color: T.muted }}>ASKING PRICE</span>
                    <span style={{ fontSize: 13, color: T.accent, fontWeight: 700 }}>{l.priceEth} ETH</span>
                  </div>
                </div>
              </div>
              <div style={{ padding: '10px 16px', borderTop: `1px solid ${T.borderLight}`, display: 'flex', gap: 8 }}>
                <button
                  onClick={() => setBuyModal(l)}
                  disabled={l.seller.toLowerCase() === address?.toLowerCase()}
                  style={{ flex: 1, background: T.accent, border: 'none', borderRadius: 3, padding: '8px', fontFamily: T.codeFont, fontSize: 9, letterSpacing: '0.08em', color: '#fff', cursor: 'pointer', fontWeight: 700 }}
                >
                  {l.seller.toLowerCase() === address?.toLowerCase() ? 'YOUR LISTING' : 'BUY NOW →'}
                </button>
                {l.seller.toLowerCase() === address?.toLowerCase() && (
                  <button
                    onClick={() => handleCancel(l.tokenId)}
                    style={{ flex: 0, background: 'none', border: `1px solid ${T.danger}`, borderRadius: 3, padding: '8px 12px', fontFamily: T.codeFont, fontSize: 9, color: T.danger, cursor: 'pointer' }}
                  >
                    CANCEL
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {buyModal && (
        <Modal title="BUY iNFT" onClose={() => setBuyModal(null)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18, fontFamily: T.codeFont }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: T.text }}>iNFT #{buyModal.tokenId}</div>
            {[
              ['Seller', buyModal.seller.slice(0, 14) + '...'],
              ['Asking price', `${buyModal.priceEth} ETH`],
            ].map(([k, v]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: `1px solid ${T.borderLight}`, paddingBottom: 8 }}>
                <span style={{ fontSize: 10, color: T.muted }}>{k}</span>
                <span style={{ fontSize: 11, color: T.text, fontWeight: 700 }}>{v}</span>
              </div>
            ))}
            <div style={{ background: T.faint, border: `1px solid ${T.border}`, borderRadius: 3, padding: '14px 16px' }}>
              <div style={{ fontSize: 9, color: T.muted, letterSpacing: '0.1em', marginBottom: 10 }}>WHAT YOU GET</div>
              {['Full royalty stream from future queries', 'ERC-7857 iNFT on 0G blockchain', 'Decrypt-gated read access via /unlock'].map(b => (
                <div key={b} style={{ fontSize: 11, color: T.text, marginBottom: 6 }}>✓ {b}</div>
              ))}
            </div>
            {!address && <div style={{ fontSize: 11, color: T.danger }}>Connect your wallet to buy.</div>}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <BtnGhost onClick={() => setBuyModal(null)}>CANCEL</BtnGhost>
              <BtnPrimary onClick={() => handleBuy(buyModal)} disabled={!address}>
                BUY FOR {buyModal.priceEth} ETH →
              </BtnPrimary>
            </div>
          </div>
        </Modal>
      )}

      {listModal && (
        <Modal title="LIST iNFT FOR SALE" onClose={() => setListModal(false)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18, fontFamily: T.codeFont }}>
            <div>
              <div style={{ fontSize: 10, color: T.muted, marginBottom: 6 }}>TOKEN ID</div>
              <input
                value={listTokenId}
                onChange={e => setListTokenId(e.target.value)}
                placeholder="42"
                style={{ width: '100%', background: T.bg, border: `1px solid ${T.border}`, borderRadius: 3, padding: '8px 12px', fontFamily: T.codeFont, fontSize: 13, color: T.text }}
              />
            </div>
            <div>
              <div style={{ fontSize: 10, color: T.muted, marginBottom: 6 }}>ASKING PRICE (ETH)</div>
              <input
                value={listPrice}
                onChange={e => setListPrice(e.target.value)}
                placeholder="0.2"
                style={{ width: '100%', background: T.bg, border: `1px solid ${T.border}`, borderRadius: 3, padding: '8px 12px', fontFamily: T.codeFont, fontSize: 16, color: T.text }}
              />
              <div style={{ fontSize: 9, color: T.muted, marginTop: 6 }}>While listed, royalties still accrue to you. If sold, future royalties go to buyer.</div>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <BtnGhost onClick={() => setListModal(false)}>CANCEL</BtnGhost>
              <BtnPrimary onClick={handleList} disabled={!address || !listTokenId || !listPrice}>
                LIST FOR SALE →
              </BtnPrimary>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
