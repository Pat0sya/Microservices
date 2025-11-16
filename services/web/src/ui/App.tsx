import React from 'react'
import { useMutation, useQuery, QueryClient, useQueryClient } from '@tanstack/react-query'
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore react-toastify types may not be picked up by linter in this workspace layout
import { toast } from 'react-toastify'
import { BrowserRouter, Link, Route, Routes, useNavigate, useParams, useSearchParams } from 'react-router-dom'

const apiBase = '/api'
async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(apiBase + path, init)
  if (!res.ok) {
    const text = await res.text()
    try { const j = JSON.parse(text); throw new Error(j.error || text) } catch { throw new Error(text) }
  }
  return res.json() as Promise<T>
}

type Product = { id: string; name: string; price: number }
type OrderT = { id: string; userId: string; productId: string; qty: number; status: string; trackingId?: string }

function useAuthToken() {
  const [token, setToken] = React.useState<string>('')
  return { token, setToken }
}

function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="container">
      <header style={{ display:'flex', alignItems:'center', gap:16, marginBottom:16 }}>
        <h2 style={{ margin:0 }}>ElectroShop</h2>
        <nav style={{ display:'flex', gap:12 }}>
          <Link to="/">Catalog</Link>
          <Link to="/cart">Cart</Link>
          <Link to="/orders">Orders</Link>
          <Link to="/profile">Profile</Link>
          <Link to="/notifications">Notifications</Link>
        </nav>
        <AuthAvatar />
      </header>
      <div className="panel">{children}</div>
    </div>
  )
}

function CatalogPage() {
  const [q, setQ] = React.useState('')
  const list = useQuery({ queryKey:['products'], queryFn:()=>api<Product[]>('/products') })
  const filtered = (list.data||[]).filter(p=> p.name.toLowerCase().includes(q.toLowerCase()))
  return (
    <div>
      <div style={{ display:'flex', gap:8, marginBottom:12 }}>
        <input placeholder="Search products" value={q} onChange={e=>setQ(e.target.value)} />
      </div>
      <div className="grid">
        {filtered.map(p=> (
          <div key={p.id} className="panel">
            <strong>{p.name}</strong>
            <div style={{ color:'#d1fae5' }}>${p.price}</div>
            <div style={{ marginTop:8, display:'flex', gap:8 }}>
              <Link to={`/product/${p.id}`} className="outline">Open</Link>
              <button onClick={()=> addToCart(p)}>Add</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function ProductPage() {
  const { id } = useParams()
  const q = useQuery({ queryKey:['product', id], queryFn:()=>api<Product>(`/products/${id}`) })
  if (q.isLoading) return <>Loading…</>
  if (!q.data) return <>Not found</>
  return (
    <div>
      <h3>{q.data.name}</h3>
      <div>Price: ${q.data.price}</div>
      <div>ID: {q.data.id}</div>
      <div style={{ marginTop:8 }}>
        <button onClick={()=> addToCart(q.data)}>Add to cart</button>
      </div>
    </div>
  )
}

type CartItem = Product & { qty: number }
function useCart(){
  const [token, setToken] = React.useState(localStorage.getItem('token')||'')
  const qc = useQueryClient()
  React.useEffect(()=>{
    const updateToken = () => {
      const newToken = localStorage.getItem('token')||''
      setToken(newToken)
    }
    updateToken()
    // Listen for storage changes (e.g., login in another tab)
    window.addEventListener('storage', updateToken)
    // Listen for custom token update event (e.g., after login)
    const handleTokenUpdate = () => updateToken()
    window.addEventListener('tokenUpdated', handleTokenUpdate)
    return () => {
      window.removeEventListener('storage', updateToken)
      window.removeEventListener('tokenUpdated', handleTokenUpdate)
    }
  },[])
  async function fetchCart(): Promise<CartItem[]>{
    if (!token) {
      console.log('No token, returning empty cart')
      return [];
    }
    try {
      console.log('Fetching cart with token:', token.substring(0, 20) + '...')
      const rows = await api<{productId:string, qty:number}[]>('/profiles/me/cart', { headers: { 'authorization':'Bearer '+token } })
      console.log('Cart rows from API:', rows)
      
      if (!rows || rows.length === 0) {
        console.log('Cart is empty')
        return []
      }
      
      // We need product details for names/prices; fetch products and join
      const products = await api<Product[]>('/products')
      const map = new Map(products.map(p=>[String(p.id), p]))
      const next: CartItem[] = []
      
      for (const r of rows){ 
        const productIdStr = String(r.productId)
        const p = map.get(productIdStr)
        if (p) {
          next.push({ ...p, qty: r.qty })
        } else {
          console.warn('Product not found for cart item:', r.productId)
        }
      }
      
      console.log('Processed cart items:', next)
      return next
    } catch (e: any) {
      console.error('Fetch cart error:', e)
      // Don't return empty array on error - let the error propagate so UI can show it
      throw e
    }
  }
  const list = useQuery({ 
    queryKey:['cart', token], 
    queryFn: fetchCart, 
    enabled: !!token,
    refetchOnWindowFocus: true, 
    refetchInterval: 5000,
    retry: 1,
    staleTime: 0 // Always consider data stale to ensure fresh data
  })
  async function persist(productId: string, qty: number){
    if (!token) {
      toast.error('Please login to add items to cart')
      return;
    }
    try {
      await api('/profiles/me/cart', { method:'POST', headers:{ 'content-type':'application/json', 'authorization':'Bearer '+token }, body: JSON.stringify({ productId, qty }) })
      // Force refetch to get updated data
      await qc.refetchQueries({ queryKey:['cart', token] })
    } catch (e: any) {
      toast.error(e?.message || 'Failed to update cart')
      console.error('Persist cart error:', e)
      throw e
    }
  }
  async function add(p: Product){
    try {
      // Fetch current cart state to get accurate qty
      // This ensures we have the latest data from the server
      const currentData = await fetchCart()
      // Normalize IDs to strings for comparison
      const productIdStr = String(p.id)
      const current = currentData.find(x=>String(x.id)===productIdStr)?.qty || 0
      const newQty = current + 1
      
      console.log(`Adding product ${productIdStr}: current qty=${current}, new qty=${newQty}`)
      
      // Send the new absolute qty value to the server
      await persist(productIdStr, newQty)
      
      // Immediately refetch to get the updated cart
      await qc.refetchQueries({ queryKey:['cart', token] })
      
      toast.success(`Added ${p.name} to cart (${newQty} total)`)
    } catch (e: any) {
      toast.error(e?.message || 'Failed to add to cart')
      console.error('Add to cart error:', e)
    }
  }
  async function inc(id: string){
    const currentData = list.data || await fetchCart()
    const idStr = String(id)
    const current = currentData.find(x=>String(x.id)===idStr)?.qty || 0
    if (current <= 0) return;
    await persist(idStr, current + 1)
    await qc.refetchQueries({ queryKey:['cart', token] })
  }
  async function dec(id: string){
    const currentData = list.data || await fetchCart()
    const idStr = String(id)
    const current = currentData.find(x=>String(x.id)===idStr)?.qty || 0
    if (current > 1) {
      await persist(idStr, current - 1)
      await qc.refetchQueries({ queryKey:['cart', token] })
    }
  }
  async function rm(id: string){
    await persist(String(id), 0)
    await qc.refetchQueries({ queryKey:['cart', token] })
  }
  async function clear(){
    if (!token) return;
    await api('/profiles/me/cart', { method:'DELETE', headers:{ 'authorization':'Bearer '+token } })
    await qc.refetchQueries({ queryKey:['cart', token] })
  }
  const items = list.data || []
  return { items, add, inc, dec, rm, clear, list }
}
const CartContext = React.createContext<ReturnType<typeof useCart> | null>(null)
function useCartCtx(){ const c = React.useContext(CartContext); if(!c) throw new Error('CartContext'); return c }
function CartProvider({children}:{children:React.ReactNode}){ 
  const c = useCart(); 
  React.useEffect(() => {
    (window as any).__cart = c;
  }, [c]);
  return <CartContext.Provider value={c}>{children}</CartContext.Provider> 
}
function addToCart(p: Product){ 
  const c = (window as any).__cart as ReturnType<typeof useCart> | undefined; 
  if (!c) {
    toast.error('Cart not initialized. Please refresh the page.');
    console.error('Cart context not available');
    return;
  }
  c.add(p).catch((e: any) => {
    console.error('addToCart error:', e);
  });
}
function CartPage(){
  const navigate = useNavigate()
  const cart = useCartCtx()
  const { items, inc, dec, rm, clear, list } = cart
  const displayItems = items || []
  const total = displayItems.reduce((s,x)=> s + x.price * x.qty, 0)
  const placing = React.useRef(false)
  
  // Debug logging
  React.useEffect(() => {
    console.log('CartPage - items:', items)
    console.log('CartPage - list.data:', list.data)
    console.log('CartPage - list.isLoading:', list.isLoading)
    console.log('CartPage - list.error:', list.error)
  }, [items, list.data, list.isLoading, list.error])
  
  async function placeOrder(){
    if (placing.current) return; placing.current = true;
    try {
      const token = localStorage.getItem('token')||'';
      for (const it of displayItems){
        await api('/orders', { method:'POST', headers:{ 'content-type':'application/json', 'authorization':'Bearer '+token }, body: JSON.stringify({ productId: it.id, qty: it.qty }) })
      }
      clear();
      toast.success('Order(s) created')
      navigate('/orders');
    } catch (e:any) { toast.error(e?.message || 'Failed to place order') } finally { placing.current = false }
  }
  
  if (list.isLoading) {
    return (
      <div>
        <h3>Cart</h3>
        <div>Loading cart...</div>
      </div>
    )
  }
  
  if (list.error) {
    return (
      <div>
        <h3>Cart</h3>
        <div style={{ color: 'red' }}>
          Error loading cart: {list.error instanceof Error ? list.error.message : String(list.error)}
        </div>
        <button onClick={() => list.refetch()}>Retry</button>
      </div>
    )
  }
  
  return (
    <div>
      <h3>Cart</h3>
      {displayItems.length === 0 ? (
        <div>Cart is empty. Add items from the catalog.</div>
      ) : (
        <>
          {displayItems.map(it=> (
            <div key={it.id} style={{ display:'flex', gap:8, alignItems:'center', marginBottom:8, padding:8, background:'#1e293b', borderRadius:8 }}>
              <strong style={{ minWidth:220 }}>{it.name}</strong>
              <span>${it.price}</span>
              <button className="outline" onClick={()=>dec(it.id)}>–</button>
              <span style={{ minWidth:30, textAlign:'center' }}>{it.qty}</span>
              <button className="outline" onClick={()=>inc(it.id)}>+</button>
              <button className="outline" onClick={()=>rm(it.id)}>Remove</button>
            </div>
          ))}
          <div style={{ marginTop:12, padding:12, background:'#1e293b', borderRadius:8 }}>
            <strong>Total: ${total.toFixed(2)}</strong>
          </div>
          <div style={{ marginTop:12 }}>
            <button onClick={placeOrder}>Place order</button>
          </div>
        </>
      )}
    </div>
  )
}
function OrdersPage(){
  const qc = useQueryClient()
  const list = useQuery({ queryKey:['orders'], queryFn:()=>api<OrderT[]>('/orders', { headers: authHeader() }), refetchInterval: 15000, refetchOnWindowFocus: true })
  function authHeader(){ const t = localStorage.getItem('token')||''; return { 'authorization':'Bearer '+t } }
  const pay = useMutation({ mutationFn: (id: string)=> api(`/orders/${id}/pay`, { method:'POST', headers: authHeader() }), onSuccess:()=> qc.invalidateQueries({ queryKey:['orders'] }) })
  const received = useMutation({ mutationFn: (id: string)=> api(`/orders/${id}/received`, { method:'POST', headers: authHeader() }), onSuccess:()=> qc.invalidateQueries({ queryKey:['orders'] }) })
  if (list.isLoading) return <>Loading…</>
  const orders = (list.data||[]).filter(o=> o.status !== 'received')
  return (
    <div>
      <h3>My Orders</h3>
      {orders.map(o=> (
        <OrderCard key={o.id} order={o} onPay={()=>pay.mutate(String(o.id))} onReceived={()=>received.mutate(String(o.id))} />
      ))}
    </div>
  )
}

function OrderCard({ order, onPay, onReceived }:{ order: OrderT; onPay: ()=>void; onReceived: ()=>void }){
  const token = localStorage.getItem('token')||''
  const qc = useQueryClient()
  const tracking = useQuery({
    queryKey: ['track', order.trackingId],
    queryFn: ()=> api(`/shipping/track/${order.trackingId}`),
    enabled: Boolean(order.trackingId),
    refetchInterval: order.trackingId ? 10000 : false,
  }) as any
  const stages: Array<{ name: string; at?: number }> = tracking.data?.stages || []
  const status: string = tracking.data?.status || order.status
  const timeline = ['processing','collected','in_transit','delivered_to_pickup']
  const canPay = order.status==='failed' || order.status==='created_unpaid'
  const canReceived = status==='delivered_to_pickup' || order.status==='delivered_to_pickup'
  React.useEffect(()=>{
    if (!order.trackingId) return
    if (status==='delivered_to_pickup' || order.status==='received') return
    const id = setInterval(()=>{
      void api('/shipping/advance', { method:'POST', headers:{ 'content-type':'application/json' }, body: JSON.stringify({ trackingId: order.trackingId }) })
        .then(()=>{ void qc.invalidateQueries({ queryKey:['orders'] }); void qc.invalidateQueries({ queryKey:['track', order.trackingId] }) })
        .catch(()=>{})
    }, 60000)
    return ()=> clearInterval(id)
  }, [order.trackingId, status, order.status, qc])
  return (
    <div className="panel" style={{ marginBottom:12 }}>
      <div style={{ display:'flex', gap:12, alignItems:'center', justifyContent:'space-between' }}>
        <div style={{ display:'flex', gap:12, alignItems:'center' }}>
          <strong>#{order.id}</strong>
          <span>status: {order.status}</span>
          {order.trackingId && <span>tracking: {order.trackingId}</span>}
        </div>
        <div style={{ display:'flex', gap:8 }}>
          {canPay && <button onClick={onPay}>Pay</button>}
          {canReceived && <button onClick={onReceived}>Received</button>}
        </div>
      </div>
      {order.trackingId && (
        <div style={{ marginTop:10 }}>
          <div style={{ marginBottom:6 }}><strong>Delivery</strong> — {status}</div>
          <div style={{ display:'grid', gap:6 }}>
            {timeline.map(step => {
              const done = stages.some((s:any)=> s.name===step)
              const ts = stages.find((s:any)=> s.name===step)?.at
              return (
                <div key={step} style={{ display:'flex', alignItems:'center', gap:8 }}>
                  <div style={{ width:10, height:10, borderRadius:9999, background: done? '#22c55e' : '#94a3b8' }} />
                  <div style={{ minWidth:180 }}>{step.replace(/_/g,' ')}</div>
                  <div style={{ color:'#94a3b8' }}>{ts? new Date(ts).toLocaleTimeString() : ''}</div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
function ProfilePage(){
  const token = localStorage.getItem('token')||''
  const qc = useQueryClient()
  if (!token) return (
    <div>
      <h3>Sign in</h3>
      <AuthBar />
    </div>
  );
  
  const me = useQuery({ 
    queryKey:['me', token], 
    queryFn:()=>api<any>('/profiles/me', { headers: { 'authorization':'Bearer '+token } }),
    enabled: !!token
  })
  
  const [showAddAddress, setShowAddAddress] = React.useState(false)
  const [newAddress, setNewAddress] = React.useState({ line1: '', city: '', zip: '' })
  
  const addAddress = useMutation({
    mutationFn: async (addr: { line1: string; city: string; zip: string }) => {
      return api('/profiles/me/addresses', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'authorization': `Bearer ${token}`
        },
        body: JSON.stringify(addr)
      })
    },
    onSuccess: () => {
      toast.success('Address added successfully')
      setShowAddAddress(false)
      setNewAddress({ line1: '', city: '', zip: '' })
      qc.invalidateQueries({ queryKey: ['me', token] })
      qc.invalidateQueries({ queryKey: ['profile', token] })
    },
    onError: (e: any) => {
      toast.error(e?.message || 'Failed to add address')
    }
  })
  
  const handleAddAddress = () => {
    if (!newAddress.line1 || !newAddress.city || !newAddress.zip) {
      toast.error('Please fill in all address fields')
      return
    }
    addAddress.mutate(newAddress)
  }
  
  if (me.isLoading) return <>Loading…</>
  return (
    <div>
      <h3>My profile</h3>
      <div className="grid" style={{ gridTemplateColumns:'repeat(auto-fit, minmax(260px,1fr))' }}>
        <div className="panel">
          <strong>Account</strong>
          <div style={{ marginTop:8, color:'#94a3b8' }}>Email</div>
          <div>{me.data?.email}</div>
          <div style={{ marginTop:8, color:'#94a3b8' }}>Name</div>
          <div>{me.data?.name || '—'}</div>
          <div style={{ marginTop:8, color:'#94a3b8' }}>Phone</div>
          <div>{me.data?.phone || '—'}</div>
        </div>
        <div className="panel">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <strong>Addresses</strong>
            <button 
              className="outline" 
              onClick={() => setShowAddAddress(!showAddAddress)}
              style={{ fontSize: 12, padding: '4px 8px' }}
            >
              {showAddAddress ? 'Cancel' : '+ Add'}
            </button>
          </div>
          
          {/* Form to add new address */}
          {showAddAddress && (
            <div style={{ padding: 12, background: '#0b1220', borderRadius: 8, marginBottom: 12 }}>
              <div style={{ marginBottom: 8 }}>
                <input
                  type="text"
                  placeholder="Street address"
                  value={newAddress.line1}
                  onChange={(e) => setNewAddress({ ...newAddress, line1: e.target.value })}
                  style={{ width: '100%', padding: 8, background: '#1e293b', border: '1px solid #334155', borderRadius: 4, color: '#fff' }}
                />
              </div>
              <div style={{ marginBottom: 8, display: 'flex', gap: 8 }}>
                <input
                  type="text"
                  placeholder="City"
                  value={newAddress.city}
                  onChange={(e) => setNewAddress({ ...newAddress, city: e.target.value })}
                  style={{ flex: 1, padding: 8, background: '#1e293b', border: '1px solid #334155', borderRadius: 4, color: '#fff' }}
                />
                <input
                  type="text"
                  placeholder="ZIP"
                  value={newAddress.zip}
                  onChange={(e) => setNewAddress({ ...newAddress, zip: e.target.value })}
                  style={{ width: 100, padding: 8, background: '#1e293b', border: '1px solid #334155', borderRadius: 4, color: '#fff' }}
                />
              </div>
              <button 
                onClick={handleAddAddress}
                disabled={addAddress.isPending}
                style={{ width: '100%' }}
              >
                {addAddress.isPending ? 'Adding...' : 'Add Address'}
              </button>
            </div>
          )}
          
          {/* List of addresses */}
          <div style={{ display:'grid', gap:8, marginTop:8 }}>
            {(me.data?.addresses||[]).map((a:any)=> (
              <div key={a.id} className="panel" style={{ background:'#0b1220' }}>
                <div style={{ fontWeight:600 }}>{a.line1}</div>
                <div style={{ color:'#94a3b8' }}>{a.city}, {a.zip}</div>
              </div>
            ))}
            {(me.data?.addresses||[]).length===0 && !showAddAddress && (
              <div style={{ color:'#94a3b8', textAlign: 'center', padding: 16 }}>
                No addresses. Click "+ Add" to add one.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
function NotificationsPage(){
  const list = useQuery({ queryKey:['notifylogs'], queryFn:()=>api<any[]>('/notify/logs') })
  if (list.isLoading) return <>Loading…</>
  return (
    <div>
      <h3>Notifications</h3>
      <div className="grid" style={{ gridTemplateColumns:'repeat(auto-fit, minmax(280px,1fr))' }}>
        {(list.data||[]).map((n:any)=> (
          <div key={n.id||n.ts} className="panel">
            <div style={{ display:'flex', justifyContent:'space-between', gap:8 }}>
              <strong>{n.type}</strong>
              <span style={{ color:'#94a3b8' }}>{new Date(n.created_at||n.ts).toLocaleString()}</span>
            </div>
            <div style={{ marginTop:6, color:'#94a3b8' }}>To: {n.recipient||n.to}</div>
            <div style={{ marginTop:6, background:'#0b1220', borderRadius:8, padding:8, fontSize:12 }}>
              <code style={{ whiteSpace:'pre-wrap' }}>{JSON.stringify(n.payload, null, 2)}</code>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
function CheckoutPage(){
  const navigate = useNavigate()
  const cart = useCartCtx()
  const { items, clear } = cart
  const token = localStorage.getItem('token')||''
  
  const [selectedAddress, setSelectedAddress] = React.useState<string>('')
  const [shippingPrice, setShippingPrice] = React.useState<number | null>(null)
  const [isProcessing, setIsProcessing] = React.useState(false)
  const [step, setStep] = React.useState<'cart' | 'address' | 'payment' | 'confirm'>('cart')
  
  // Get user profile with addresses
  const profile = useQuery({ 
    queryKey:['profile', token], 
    queryFn:()=>api<any>('/profiles/me', { headers: { 'authorization':'Bearer '+token } }),
    enabled: !!token
  })
  
  const addresses = profile.data?.addresses || []
  
  // Calculate totals
  const subtotal = items.reduce((s,x)=> s + x.price * x.qty, 0)
  const total = subtotal + (shippingPrice || 0)
  
  // Get shipping quote when address is selected
  const shippingQuote = useMutation({
    mutationFn: async (address: string) => {
      // Create a temporary order ID for quote calculation
      const tempOrderId = `temp-${Date.now()}`
      console.log('Requesting shipping quote for address:', address)
      return api<{price: number}>('/shipping/quote', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ orderId: tempOrderId, address })
      })
    },
    onSuccess: (data) => {
      console.log('Shipping quote received:', data.price)
      setShippingPrice(data.price)
    },
    onError: (error: any) => {
      console.error('Shipping quote error:', error)
      toast.error('Failed to calculate shipping. Please try again.')
      setShippingPrice(null)
    }
  })
  
  React.useEffect(() => {
    if (selectedAddress && step === 'address' && shippingPrice === null && !shippingQuote.isPending && !shippingQuote.isError) {
      console.log('Triggering shipping quote for:', selectedAddress)
      shippingQuote.mutate(selectedAddress)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAddress, step])
  
  // Handle checkout process
  async function handleCheckout(){
    console.log('handleCheckout called, step:', step, 'selectedAddress:', selectedAddress, 'shippingPrice:', shippingPrice)
    
    if (!token) {
      toast.error('Please login to checkout')
      navigate('/profile')
      return
    }
    
    if (items.length === 0) {
      toast.error('Cart is empty')
      navigate('/cart')
      return
    }
    
    if (step === 'cart') {
      if (addresses.length === 0) {
        toast.error('Please add a delivery address first')
        navigate('/profile')
        return
      }
      setStep('address')
      return
    }
    
    if (step === 'address') {
      if (!selectedAddress) {
        toast.error('Please select a delivery address')
        return
      }
      if (shippingPrice === null) {
        toast.error('Please wait for shipping calculation')
        return
      }
      console.log('Moving to payment step')
      setStep('payment')
      return
    }
    
    if (step === 'payment') {
      console.log('Processing payment and creating orders')
      setStep('confirm')
      setIsProcessing(true)
      
      try {
        // Create orders for each cart item
        const orderIds: string[] = []
        for (const item of items) {
          const order = await api<{id: string}>('/orders', {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              'authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ productId: item.id, qty: item.qty })
          })
          orderIds.push(order.id)
        }
        
        // Pay for all orders
        let allPaid = true
        for (const orderId of orderIds) {
          try {
            await api(`/orders/${orderId}/pay`, {
              method: 'POST',
              headers: { 'authorization': `Bearer ${token}` }
            })
          } catch (e: any) {
            console.error(`Failed to pay order ${orderId}:`, e)
            allPaid = false
          }
        }
        
        if (allPaid) {
          clear()
          toast.success('Order placed and paid successfully!')
          navigate('/orders')
        } else {
          toast.warning('Orders created but some payments failed. Check your orders page.')
          navigate('/orders')
        }
      } catch (e: any) {
        toast.error(e?.message || 'Failed to complete checkout')
        console.error('Checkout error:', e)
      } finally {
        setIsProcessing(false)
      }
    }
  }
  
  if (!token) {
    return (
      <div>
        <h3>Checkout</h3>
        <div>Please <Link to="/profile">login</Link> to proceed with checkout.</div>
      </div>
    )
  }
  
  if (items.length === 0) {
    return (
      <div>
        <h3>Checkout</h3>
        <div>Your cart is empty. <Link to="/">Browse products</Link> to add items.</div>
      </div>
    )
  }
  
  if (profile.isLoading) {
    return <div><h3>Checkout</h3>Loading...</div>
  }
  
  return (
    <div>
      <h3>Checkout</h3>
      
      {/* Progress indicator */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 24, alignItems: 'center' }}>
        <div style={{ 
          padding: '8px 16px', 
          background: step === 'cart' ? '#4f46e5' : '#1e293b', 
          borderRadius: 8,
          fontWeight: step === 'cart' ? 'bold' : 'normal'
        }}>
          1. Cart
        </div>
        <div>→</div>
        <div style={{ 
          padding: '8px 16px', 
          background: step === 'address' ? '#4f46e5' : step === 'payment' || step === 'confirm' ? '#334155' : '#1e293b', 
          borderRadius: 8,
          fontWeight: step === 'address' ? 'bold' : 'normal'
        }}>
          2. Address
        </div>
        <div>→</div>
        <div style={{ 
          padding: '8px 16px', 
          background: step === 'payment' ? '#4f46e5' : step === 'confirm' ? '#334155' : '#1e293b', 
          borderRadius: 8,
          fontWeight: step === 'payment' ? 'bold' : 'normal'
        }}>
          3. Payment
        </div>
        <div>→</div>
        <div style={{ 
          padding: '8px 16px', 
          background: step === 'confirm' ? '#4f46e5' : '#1e293b', 
          borderRadius: 8,
          fontWeight: step === 'confirm' ? 'bold' : 'normal'
        }}>
          4. Confirm
        </div>
      </div>
      
      {/* Step 1: Cart Review */}
      {(step === 'cart') && (
        <div>
          <h4>Review Your Order</h4>
          <div style={{ marginBottom: 16 }}>
            {items.map(it=> (
              <div key={it.id} style={{ display:'flex', gap:8, alignItems:'center', marginBottom:8, padding:8, background:'#1e293b', borderRadius:8 }}>
                <strong style={{ minWidth:220 }}>{it.name}</strong>
                <span>${it.price} × {it.qty}</span>
                <span style={{ marginLeft: 'auto' }}>${(it.price * it.qty).toFixed(2)}</span>
              </div>
            ))}
          </div>
          <div style={{ padding:12, background:'#1e293b', borderRadius:8, marginBottom:16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <strong>Subtotal:</strong>
              <strong>${subtotal.toFixed(2)}</strong>
            </div>
          </div>
          <button onClick={handleCheckout} style={{ width: '100%' }}>
            Continue to Address Selection
          </button>
        </div>
      )}
      
      {/* Step 2: Address Selection */}
      {(step === 'address') && (
        <div>
          <h4>Select Delivery Address</h4>
          {addresses.length === 0 ? (
            <div style={{ marginBottom: 16 }}>
              <div>No addresses found. <Link to="/profile">Add an address</Link> first.</div>
            </div>
          ) : (
            <div style={{ marginBottom: 16 }}>
              {addresses.map((addr: any) => {
                const addrString = `${addr.line1}, ${addr.city}, ${addr.zip}`
                const isSelected = selectedAddress === addrString
                return (
                  <div 
                    key={addr.id} 
                    onClick={() => {
                      console.log('Address selected:', addrString)
                      setSelectedAddress(addrString)
                      // Reset shipping price to trigger recalculation
                      setShippingPrice(null)
                    }}
                    style={{
                      padding: 12,
                      marginBottom: 8,
                      background: isSelected ? '#4f46e5' : '#1e293b',
                      borderRadius: 8,
                      cursor: 'pointer',
                      border: isSelected ? '2px solid #6366f1' : '2px solid transparent',
                      transition: 'all 0.2s'
                    }}
                  >
                    <div style={{ fontWeight: 600 }}>{addr.line1}</div>
                    <div style={{ color: '#94a3b8' }}>{addr.city}, {addr.zip}</div>
                    {isSelected && (
                      <div style={{ marginTop: 4, fontSize: 12, color: '#a5b4fc' }}>✓ Selected</div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
          
          {selectedAddress && shippingQuote.isPending && (
            <div style={{ marginBottom: 16, padding: 12, background: '#1e293b', borderRadius: 8 }}>
              <div>⏳ Calculating shipping cost...</div>
            </div>
          )}
          
          {selectedAddress && shippingQuote.isError && (
            <div style={{ marginBottom: 16, padding: 12, background: '#7f1d1d', borderRadius: 8, color: '#fca5a5' }}>
              <div style={{ marginBottom: 8 }}>❌ Failed to calculate shipping.</div>
              <button 
                className="outline" 
                onClick={() => {
                  setShippingPrice(null)
                  shippingQuote.mutate(selectedAddress)
                }}
                style={{ fontSize: 12, padding: '4px 8px' }}
              >
                Retry
              </button>
            </div>
          )}
          
          {selectedAddress && shippingPrice !== null && !shippingQuote.isPending && (
            <div style={{ padding:12, background:'#1e293b', borderRadius:8, marginBottom:16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span>Subtotal:</span>
                <span>${subtotal.toFixed(2)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span>Shipping:</span>
                <span>${shippingPrice.toFixed(2)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 8, borderTop: '1px solid #334155' }}>
                <strong>Total:</strong>
                <strong>${total.toFixed(2)}</strong>
              </div>
            </div>
          )}
          
          {selectedAddress && !shippingQuote.isPending && shippingPrice === null && !shippingQuote.isError && (
            <div style={{ marginBottom: 16, padding: 12, background: '#1e293b', borderRadius: 8, color: '#94a3b8' }}>
              <div>Select an address to calculate shipping</div>
            </div>
          )}
          
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="outline" onClick={() => {
              setStep('cart')
              setSelectedAddress('')
              setShippingPrice(null)
            }}>Back</button>
            <button 
              onClick={() => {
                console.log('Continue to Payment clicked')
                console.log('selectedAddress:', selectedAddress)
                console.log('shippingPrice:', shippingPrice)
                handleCheckout()
              }} 
              disabled={!selectedAddress || shippingPrice === null || shippingQuote.isPending}
              style={{ flex: 1, opacity: (!selectedAddress || shippingPrice === null || shippingQuote.isPending) ? 0.5 : 1 }}
            >
              {shippingQuote.isPending ? 'Calculating...' : 'Continue to Payment'}
            </button>
          </div>
        </div>
      )}
      
      {/* Step 3: Payment */}
      {(step === 'payment') && (
        <div>
          <h4>Payment Information</h4>
          
          {/* Order Summary */}
          <div style={{ padding:12, background:'#1e293b', borderRadius:8, marginBottom:16 }}>
            <div style={{ marginBottom: 12, fontWeight: 600 }}>Order Summary</div>
            <div style={{ marginBottom: 8 }}>
              <div style={{ color: '#94a3b8', fontSize: 12, marginBottom: 4 }}>Items:</div>
              {items.map(it => (
                <div key={it.id} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 14 }}>
                  <span>{it.name} × {it.qty}</span>
                  <span>${(it.price * it.qty).toFixed(2)}</span>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #334155' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span>Subtotal:</span>
                <span>${subtotal.toFixed(2)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span>Shipping:</span>
                <span>${shippingPrice?.toFixed(2) || '0.00'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 8, borderTop: '1px solid #334155', marginTop: 8 }}>
                <strong>Total:</strong>
                <strong style={{ fontSize: 18 }}>${total.toFixed(2)}</strong>
              </div>
            </div>
          </div>
          
          {/* Delivery Address */}
          <div style={{ padding:12, background:'#1e293b', borderRadius:8, marginBottom:16 }}>
            <div style={{ marginBottom: 8 }}>
              <strong>Delivery Address:</strong>
              <div style={{ color: '#94a3b8', marginTop: 4 }}>{selectedAddress || 'Not selected'}</div>
            </div>
          </div>
          
          {/* Payment Method */}
          <div style={{ padding: 16, background: '#0b1220', borderRadius: 8, marginBottom: 16 }}>
            <div style={{ marginBottom: 12 }}>
              <strong>Payment Method</strong>
            </div>
            <div style={{ padding: 12, background: '#1e293b', borderRadius: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <span style={{ fontSize: 24 }}>💳</span>
                <span>Credit Card (Simulated)</span>
              </div>
              <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
                This is a demo. Payment will be processed automatically when you click "Place Order & Pay".
              </div>
            </div>
          </div>
          
          <div style={{ display: 'flex', gap: 8 }}>
            <button 
              className="outline" 
              onClick={() => {
                setStep('address')
              }}
            >
              Back
            </button>
            <button 
              onClick={() => {
                console.log('Place Order & Pay clicked')
                console.log('Items:', items)
                console.log('Total:', total)
                handleCheckout()
              }} 
              disabled={isProcessing || !selectedAddress || shippingPrice === null}
              style={{ 
                flex: 1,
                opacity: (isProcessing || !selectedAddress || shippingPrice === null) ? 0.5 : 1
              }}
            >
              {isProcessing ? 'Processing...' : 'Place Order & Pay'}
            </button>
          </div>
        </div>
      )}
      
      {/* Step 4: Confirmation */}
      {(step === 'confirm') && (
        <div>
          <h4>Processing Your Order...</h4>
          {isProcessing ? (
            <div>
              <div>Creating orders...</div>
              <div>Processing payment...</div>
            </div>
          ) : (
            <div>Order completed! Redirecting...</div>
          )}
        </div>
      )}
    </div>
  )
}

function AuthBar() {
  const [email, setEmail] = React.useState('user@example.com')
  const [pwd, setPwd] = React.useState('secret12')
  const navigate = useNavigate()
  const doRegister = useMutation({ mutationFn:()=> api('/auth/register',{ method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ email, password: pwd, role:'user' }) }) , onSuccess:()=> toast.success('Registered') , onError:(e:any)=> toast.error(e?.message||'Register failed')})
  const doLogin = useMutation({ mutationFn:()=> api<{token:string}>('/auth/login',{ method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ email, password: pwd }) }) , onSuccess:()=> toast.success('Logged in'), onError:(e:any)=> toast.error(e?.message||'Login failed')})
  React.useEffect(()=>{ 
    if (doLogin.data?.token){ 
      localStorage.setItem('token', doLogin.data.token); 
      // Dispatch custom event to update cart token
      window.dispatchEvent(new Event('tokenUpdated'))
      navigate('/'); 
    } 
  }, [doLogin.data, navigate])
  return (
    <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:12 }}>
      <input value={email} onChange={e=>setEmail(e.target.value)} placeholder="email" />
      <input value={pwd} onChange={e=>setPwd(e.target.value)} placeholder="password" type="password" />
      <button className="outline" onClick={()=>doRegister.mutate()} disabled={doRegister.isPending}>Register</button>
      <button onClick={()=>doLogin.mutate()} disabled={doLogin.isPending}>Login</button>
    </div>
  )
}

function AuthAvatar(){
  const [me, setMe] = React.useState<{ email:string }|null>(null)
  React.useEffect(()=>{
    const t = localStorage.getItem('token')||'';
    if(!t){ setMe(null); return }
    fetch('/api/auth/me', { headers: { 'authorization':'Bearer '+t } }).then(r=>r.ok?r.json():null).then(setMe).catch(()=>setMe(null));
  },[])
  return (
    <div style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:10 }}>
      <Link to="/checkout" className="outline">Checkout</Link>
      {me? (
        <div title={me.email} style={{ width:28, height:28, background:'#4f46e5', color:'#fff', display:'grid', placeItems:'center', borderRadius:9999 }}>
          {me.email.slice(0,1).toUpperCase()}
        </div>
      ) : (
        <Link to="/profile" className="outline">Login / Sign up</Link>
      )}
    </div>
  )
}

export function App(){
  return (
    <BrowserRouter>
      <CartProvider>
        <Layout>
          <Routes>
            <Route path="/" element={<CatalogPage/>} />
            <Route path="/product/:id" element={<ProductPage/>} />
            <Route path="/cart" element={<CartPage/>} />
            <Route path="/orders" element={<OrdersPage/>} />
            <Route path="/profile" element={<ProfilePage/>} />
            <Route path="/notifications" element={<NotificationsPage/>} />
            <Route path="/checkout" element={<CheckoutPage/>} />
          </Routes>
        </Layout>
      </CartProvider>
    </BrowserRouter>
  )
}



