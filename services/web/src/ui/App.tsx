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
  const token = React.useRef(localStorage.getItem('token')||'')
  const qc = useQueryClient()
  React.useEffect(()=>{
    token.current = localStorage.getItem('token')||''
  },[])
  async function fetchCart(): Promise<CartItem[]>{
    const t = token.current; if (!t) return [];
    const rows = await api<{productId:string, qty:number}[]>('/profiles/me/cart', { headers: { 'authorization':'Bearer '+t } })
    // We need product details for names/prices; fetch products and join
    const products = await api<Product[]>('/products')
    const map = new Map(products.map(p=>[p.id,p]))
    const next: CartItem[] = []
    for (const r of rows){ const p = map.get(String(r.productId)); if (p) next.push({ ...p, qty: r.qty }) }
    return next
  }
  const list = useQuery({ queryKey:['cart'], queryFn: fetchCart, refetchOnWindowFocus: true, refetchInterval: 15000 })
  async function persist(productId: string, qty: number){
    const t = token.current; if (!t) return;
    await api('/profiles/me/cart', { method:'POST', headers:{ 'content-type':'application/json', 'authorization':'Bearer '+t }, body: JSON.stringify({ productId, qty }) })
    await qc.invalidateQueries({ queryKey:['cart'] })
  }
  async function add(p: Product){
    const current = (await fetchCart()).find(x=>x.id===p.id)?.qty || 0
    await persist(p.id, current + 1)
  }
  async function inc(id: string){
    const current = (await fetchCart()).find(x=>x.id===id)?.qty || 0
    if (current <= 0) return;
    await persist(id, current + 1)
  }
  async function dec(id: string){
    const current = (await fetchCart()).find(x=>x.id===id)?.qty || 0
    if (current > 1) await persist(id, current - 1)
  }
  async function rm(id: string){
    await persist(id, 0)
  }
  async function clear(){
    const t = token.current; if (!t) return;
    await api('/profiles/me/cart', { method:'DELETE', headers:{ 'authorization':'Bearer '+t } })
    await qc.invalidateQueries({ queryKey:['cart'] })
  }
  const items = list.data || []
  return { items, add, inc, dec, rm, clear }
}
const CartContext = React.createContext<ReturnType<typeof useCart> | null>(null)
function useCartCtx(){ const c = React.useContext(CartContext); if(!c) throw new Error('CartContext'); return c }
function CartProvider({children}:{children:React.ReactNode}){ const c = useCart(); (window as any).__cart = c; return <CartContext.Provider value={c}>{children}</CartContext.Provider> }
function addToCart(p: Product){ const c = (window as any).__cart as ReturnType<typeof useCart> | undefined; c?.add(p) }
function CartPage(){
  const navigate = useNavigate()
  const { items, inc, dec, rm, clear } = useCartCtx()
  const total = items.reduce((s,x)=> s + x.price * x.qty, 0)
  const placing = React.useRef(false)
  async function placeOrder(){
    if (placing.current) return; placing.current = true;
    try {
      const token = localStorage.getItem('token')||'';
      for (const it of items){
        await api('/orders', { method:'POST', headers:{ 'content-type':'application/json', 'authorization':'Bearer '+token }, body: JSON.stringify({ productId: it.id, qty: it.qty }) })
      }
      clear();
      toast.success('Order(s) created')
      navigate('/orders');
    } catch (e:any) { toast.error(e?.message || 'Failed to place order') } finally { placing.current = false }
  }
  return (
    <div>
      <h3>Cart</h3>
      {items.length===0? 'Empty' : (
        <>
          {items.map(it=> (
            <div key={it.id} style={{ display:'flex', gap:8, alignItems:'center' }}>
              <strong style={{ minWidth:220 }}>{it.name}</strong>
              <span>${it.price}</span>
              <button className="outline" onClick={()=>dec(it.id)}>–</button>
              <span>{it.qty}</span>
              <button className="outline" onClick={()=>inc(it.id)}>+</button>
              <button className="outline" onClick={()=>rm(it.id)}>Remove</button>
            </div>
          ))}
          <div style={{ marginTop:12 }}><strong>Total: ${total.toFixed(2)}</strong></div>
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
  if (!token) return (
    <div>
      <h3>Sign in</h3>
      <AuthBar />
    </div>
  );
  const me = useQuery({ queryKey:['me'], queryFn:()=>api<any>('/profiles/me', { headers: { 'authorization':'Bearer '+token } }) })
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
          <strong>Addresses</strong>
          <div style={{ display:'grid', gap:8, marginTop:8 }}>
            {(me.data?.addresses||[]).map((a:any)=> (
              <div key={a.id} className="panel" style={{ background:'#0b1220' }}>
                <div style={{ fontWeight:600 }}>{a.line1}</div>
                <div style={{ color:'#94a3b8' }}>{a.city}, {a.zip}</div>
              </div>
            ))}
            {(me.data?.addresses||[]).length===0 && <div style={{ color:'#94a3b8' }}>No addresses</div>}
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
  return <div>Checkout (payments, shipping)</div>
}

function AuthBar() {
  const [email, setEmail] = React.useState('user@example.com')
  const [pwd, setPwd] = React.useState('secret12')
  const navigate = useNavigate()
  const doRegister = useMutation({ mutationFn:()=> api('/auth/register',{ method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ email, password: pwd, role:'user' }) }) , onSuccess:()=> toast.success('Registered') , onError:(e:any)=> toast.error(e?.message||'Register failed')})
  const doLogin = useMutation({ mutationFn:()=> api<{token:string}>('/auth/login',{ method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ email, password: pwd }) }) , onSuccess:()=> toast.success('Logged in'), onError:(e:any)=> toast.error(e?.message||'Login failed')})
  React.useEffect(()=>{ if (doLogin.data?.token){ localStorage.setItem('token', doLogin.data.token); navigate('/'); } }, [doLogin.data, navigate])
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


