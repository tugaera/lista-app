-- Update latest_product_prices view to include original_price
create or replace view latest_product_prices as
select distinct on (pe.product_id, pe.store_id)
  pe.id,
  pe.product_id,
  pe.store_id,
  pe.price,
  pe.original_price,
  pe.quantity,
  pe.created_at,
  p.name as product_name,
  p.barcode,
  s.name as store_name
from product_entries pe
join products p on p.id = pe.product_id
join stores s on s.id = pe.store_id
order by pe.product_id, pe.store_id, pe.created_at desc;
