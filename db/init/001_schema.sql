-- Users (auth)
create table if not exists users (
  id serial primary key,
  email text unique not null,
  password_hash text not null,
  role text not null default 'user',
  created_at timestamptz not null default now()
);

-- Profiles
create table if not exists profiles (
  id serial primary key,
  user_id int not null references users(id) on delete cascade,
  name text,
  phone text
);
create table if not exists addresses (
  id serial primary key,
  user_id int not null references users(id) on delete cascade,
  line1 text not null,
  city text not null,
  zip text not null
);
-- Catalog
create table if not exists products (
  id serial primary key,
  name text not null,
  price numeric(12,2) not null,
  seller_id int
);

-- Cart (per user, persisted)
create table if not exists cart (
  user_id int not null references users(id) on delete cascade,
  product_id int not null references products(id) on delete cascade,
  qty int not null,
  primary key(user_id, product_id)
);

-- Inventory
create table if not exists stock (
  product_id int primary key references products(id) on delete cascade,
  qty int not null default 0
);
create table if not exists reservations (
  id serial primary key,
  reservation_id text unique not null,
  product_id int not null references products(id) on delete cascade,
  qty int not null,
  created_at timestamptz not null default now()
);

-- Orders
create table if not exists orders (
  id serial primary key,
  user_id int not null references users(id) on delete cascade,
  product_id int not null references products(id),
  qty int not null,
  status text not null,
  tracking_id text,
  created_at timestamptz not null default now()
);

-- Payments
create table if not exists payments (
  id serial primary key,
  order_id int not null references orders(id) on delete cascade,
  payment_id text not null,
  amount numeric(12,2) not null,
  currency text not null,
  status text not null,
  created_at timestamptz not null default now()
);

-- Shipping
create table if not exists shipments (
  id serial primary key,
  order_id int not null references orders(id) on delete cascade,
  tracking_id text unique not null,
  status text not null,
  created_at timestamptz not null default now()
);
create table if not exists shipment_stages (
  id serial primary key,
  tracking_id text not null,
  name text not null,
  at timestamptz not null default now()
);

-- Notifications
create table if not exists notifications (
  id serial primary key,
  type text not null,
  recipient text not null,
  payload jsonb not null,
  created_at timestamptz not null default now()
);


