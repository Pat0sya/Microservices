-- seed demo user
insert into users (email, password_hash, role)
values ('user@example.com', '$argon2id$v=19$m=65536,t=3,p=1$M2Vtb0hBU1g$3dDqjH6K8sRr7tN0s+GdcJ4c4d2wLZKQ4nC78hO9J0A', 'user')
on conflict do nothing;
-- note: the password hash above is placeholder; services may overwrite on first register

-- seed products and stock
do $$
declare i int := 1;
begin
  while i <= 100 loop
    insert into products(name, price, seller_id) values (
      'Product '||i, (50 + i*9.73)::numeric(12,2), 1
    ) returning id into i;
    insert into stock(product_id, qty) values (i, (10 + (i%5)*5)) on conflict (product_id) do nothing;
    i := i + 1;
  end loop;
end $$;


