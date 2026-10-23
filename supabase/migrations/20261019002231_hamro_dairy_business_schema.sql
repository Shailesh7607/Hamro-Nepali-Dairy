-- Server-only commerce; passwords remain exclusively in Supabase Auth.
CREATE SCHEMA dairy;
REVOKE ALL ON SCHEMA dairy FROM PUBLIC,anon,authenticated;
CREATE ROLE hamro_server LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
GRANT USAGE ON SCHEMA dairy TO hamro_server;
ALTER DEFAULT PRIVILEGES IN SCHEMA dairy REVOKE ALL ON TABLES FROM PUBLIC,anon,authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA dairy REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
CREATE TABLE dairy.order_events (
 "id" text NOT NULL,
 "order_id" text NOT NULL,
 "actor" text NOT NULL,
 "action" text NOT NULL,
 "created" bigint NOT NULL,
 PRIMARY KEY("id")
);
ALTER TABLE dairy.order_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE dairy.order_events FORCE ROW LEVEL SECURITY;
REVOKE ALL ON dairy.order_events FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON dairy.order_events TO hamro_server;
CREATE POLICY server_access ON dairy.order_events TO hamro_server USING(true) WITH CHECK(true);
CREATE TABLE dairy.orders (
 "id" text NOT NULL,
 "owner" text NOT NULL,
 "payload" text NOT NULL,
 "subtotal" bigint NOT NULL,
 "delivery" bigint,
 "total" bigint NOT NULL,
 "method" text NOT NULL,
 "status" text NOT NULL DEFAULT 'new',
 "payment" text NOT NULL DEFAULT 'pending',
 "provider_id" text,
 "payment_url" text,
 "reference" text,
 "revision" bigint NOT NULL DEFAULT 0,
 "created" bigint NOT NULL,
 "updated" bigint NOT NULL,
 "mode" text NOT NULL DEFAULT '',
 "stock_token" text NOT NULL DEFAULT '',
 "stock_reserved" bigint NOT NULL DEFAULT 0,
 "stock_date" text NOT NULL DEFAULT '',
 PRIMARY KEY("id"),
 CHECK(status IN ('new','confirmed','out_for_delivery','delivered','cancelled')),
 CHECK(payment IN ('pending','paid','test_paid')),
 CHECK(subtotal>=0 AND total>=0 AND (delivery IS NULL OR delivery>=0)),
 CHECK(method IN ('cod','bank','esewa','khalti')),
 CHECK(jsonb_typeof(payload::jsonb)='object')
);
ALTER TABLE dairy.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE dairy.orders FORCE ROW LEVEL SECURITY;
REVOKE ALL ON dairy.orders FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON dairy.orders TO hamro_server;
CREATE POLICY server_access ON dairy.orders TO hamro_server USING(true) WITH CHECK(true);
CREATE TABLE dairy.operation_errors (
 "id" text NOT NULL,
 "action" text NOT NULL,
 "created" bigint NOT NULL,
 PRIMARY KEY("id")
);
ALTER TABLE dairy.operation_errors ENABLE ROW LEVEL SECURITY;
ALTER TABLE dairy.operation_errors FORCE ROW LEVEL SECURITY;
REVOKE ALL ON dairy.operation_errors FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON dairy.operation_errors TO hamro_server;
CREATE POLICY server_access ON dairy.operation_errors TO hamro_server USING(true) WITH CHECK(true);
CREATE TABLE dairy.inventory (
 "product_id" text NOT NULL,
 "available" bigint NOT NULL DEFAULT 0,
 "enabled" bigint NOT NULL DEFAULT 0,
 "revision" bigint NOT NULL DEFAULT 0,
 "updated" bigint NOT NULL,
 "low_threshold" bigint NOT NULL DEFAULT 0,
 PRIMARY KEY("product_id"),
 CHECK(available BETWEEN 0 AND 1000000),
 CHECK(enabled IN (0,1))
);
ALTER TABLE dairy.inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE dairy.inventory FORCE ROW LEVEL SECURITY;
REVOKE ALL ON dairy.inventory FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON dairy.inventory TO hamro_server;
CREATE POLICY server_access ON dairy.inventory TO hamro_server USING(true) WITH CHECK(true);
CREATE TABLE dairy.shop_settings (
 "id" text NOT NULL,
 "cutoff" text NOT NULL DEFAULT '16:00',
 "lead_days" bigint NOT NULL DEFAULT 1,
 "revision" bigint NOT NULL DEFAULT 0,
 PRIMARY KEY("id")
);
ALTER TABLE dairy.shop_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE dairy.shop_settings FORCE ROW LEVEL SECURITY;
REVOKE ALL ON dairy.shop_settings FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON dairy.shop_settings TO hamro_server;
CREATE POLICY server_access ON dairy.shop_settings TO hamro_server USING(true) WITH CHECK(true);
CREATE TABLE dairy.support_tickets (
 "id" text NOT NULL,
 "owner" text NOT NULL,
 "order_id" text NOT NULL DEFAULT '',
 "kind" text NOT NULL,
 "message" text NOT NULL,
 "status" text NOT NULL DEFAULT 'open',
 "response" text NOT NULL DEFAULT '',
 "revision" bigint NOT NULL DEFAULT 0,
 "created" bigint NOT NULL,
 "updated" bigint NOT NULL,
 PRIMARY KEY("id")
);
ALTER TABLE dairy.support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE dairy.support_tickets FORCE ROW LEVEL SECURITY;
REVOKE ALL ON dairy.support_tickets FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON dairy.support_tickets TO hamro_server;
CREATE POLICY server_access ON dairy.support_tickets TO hamro_server USING(true) WITH CHECK(true);
CREATE TABLE dairy.daily_inventory (
 "id" text NOT NULL,
 "stock_date" text NOT NULL,
 "product_id" text NOT NULL,
 "available" bigint NOT NULL DEFAULT 0,
 "enabled" bigint NOT NULL DEFAULT 0,
 "low_threshold" bigint NOT NULL DEFAULT 0,
 "revision" bigint NOT NULL DEFAULT 0,
 "updated" bigint NOT NULL,
 PRIMARY KEY("id"),
 CHECK(available BETWEEN 0 AND 1000000),
 CHECK(enabled IN (0,1))
);
ALTER TABLE dairy.daily_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE dairy.daily_inventory FORCE ROW LEVEL SECURITY;
REVOKE ALL ON dairy.daily_inventory FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON dairy.daily_inventory TO hamro_server;
CREATE POLICY server_access ON dairy.daily_inventory TO hamro_server USING(true) WITH CHECK(true);
CREATE TABLE dairy.delivery_days (
 "date" text NOT NULL,
 "max_orders" bigint NOT NULL,
 "revision" bigint NOT NULL DEFAULT 0,
 "updated" bigint NOT NULL,
 PRIMARY KEY("date")
);
ALTER TABLE dairy.delivery_days ENABLE ROW LEVEL SECURITY;
ALTER TABLE dairy.delivery_days FORCE ROW LEVEL SECURITY;
REVOKE ALL ON dairy.delivery_days FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON dairy.delivery_days TO hamro_server;
CREATE POLICY server_access ON dairy.delivery_days TO hamro_server USING(true) WITH CHECK(true);
CREATE TABLE dairy.standing_plans (
 "id" text NOT NULL,
 "owner" text NOT NULL,
 "source_id" text NOT NULL,
 "name" text NOT NULL,
 "weekdays" text NOT NULL,
 "holidays" text NOT NULL DEFAULT '[]',
 "paused" bigint NOT NULL DEFAULT 0,
 "revision" bigint NOT NULL DEFAULT 0,
 "created" bigint NOT NULL,
 PRIMARY KEY("id")
);
ALTER TABLE dairy.standing_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE dairy.standing_plans FORCE ROW LEVEL SECURITY;
REVOKE ALL ON dairy.standing_plans FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON dairy.standing_plans TO hamro_server;
CREATE POLICY server_access ON dairy.standing_plans TO hamro_server USING(true) WITH CHECK(true);
CREATE TABLE dairy.stock_movements (
 "id" text NOT NULL,
 "product_id" text NOT NULL,
 "stock_date" text NOT NULL DEFAULT '',
 "delta" bigint NOT NULL,
 "kind" text NOT NULL,
 "note" text NOT NULL DEFAULT '',
 "actor" text NOT NULL,
 "signature" text NOT NULL DEFAULT '',
 "token" text NOT NULL DEFAULT '',
 "created" bigint NOT NULL,
 PRIMARY KEY("id")
);
ALTER TABLE dairy.stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE dairy.stock_movements FORCE ROW LEVEL SECURITY;
REVOKE ALL ON dairy.stock_movements FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON dairy.stock_movements TO hamro_server;
CREATE POLICY server_access ON dairy.stock_movements TO hamro_server USING(true) WITH CHECK(true);
CREATE TABLE dairy.saved_addresses (
 "id" text,
 "owner" text NOT NULL,
 "label" text NOT NULL,
 "details" text NOT NULL,
 "revision" bigint NOT NULL DEFAULT 0,
 "updated" bigint NOT NULL,
 PRIMARY KEY("id")
);
ALTER TABLE dairy.saved_addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE dairy.saved_addresses FORCE ROW LEVEL SECURITY;
REVOKE ALL ON dairy.saved_addresses FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON dairy.saved_addresses TO hamro_server;
CREATE POLICY server_access ON dairy.saved_addresses TO hamro_server USING(true) WITH CHECK(true);
CREATE TABLE dairy.delivery_slots (
 "date" text NOT NULL,
 "slot" text NOT NULL,
 "capacity" bigint NOT NULL,
 "revision" bigint NOT NULL DEFAULT 0,
 PRIMARY KEY("date","slot"),
 CHECK(slot IN ('morning','afternoon')),
 CHECK(capacity BETWEEN 0 AND 10000)
);
ALTER TABLE dairy.delivery_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE dairy.delivery_slots FORCE ROW LEVEL SECURITY;
REVOKE ALL ON dairy.delivery_slots FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON dairy.delivery_slots TO hamro_server;
CREATE POLICY server_access ON dairy.delivery_slots TO hamro_server USING(true) WITH CHECK(true);

ALTER TABLE dairy.orders ADD business_name text GENERATED ALWAYS AS ((payload::jsonb)->>'business') STORED;
ALTER TABLE dairy.orders ADD contact_name text GENERATED ALWAYS AS ((payload::jsonb)->>'contact') STORED;
ALTER TABLE dairy.orders ADD phone text GENERATED ALWAYS AS ((payload::jsonb)->>'phone') STORED;
ALTER TABLE dairy.orders ADD delivery_address text GENERATED ALWAYS AS ((payload::jsonb)->>'address') STORED;
ALTER TABLE dairy.orders ADD delivery_date text GENERATED ALWAYS AS ((payload::jsonb)->>'deliveryDate') STORED;
ALTER TABLE dairy.orders ADD delivery_slot text GENERATED ALWAYS AS ((payload::jsonb)->>'deliverySlot') STORED;
CREATE INDEX orders_owner_created ON dairy.orders(owner,created DESC);
CREATE INDEX orders_delivery_date_slot ON dairy.orders(delivery_date,delivery_slot,status);
CREATE INDEX saved_addresses_owner ON dairy.saved_addresses(owner);
CREATE INDEX tickets_owner ON dairy.support_tickets(owner);
CREATE INDEX events_order ON dairy.order_events(order_id,created);
CREATE UNIQUE INDEX daily_product_unique ON dairy.daily_inventory(stock_date,product_id);
CREATE INDEX movements_date_product ON dairy.stock_movements(stock_date,product_id);
CREATE TABLE dairy.order_items (
 order_id text NOT NULL REFERENCES dairy.orders(id) ON DELETE CASCADE,
 product_id text NOT NULL, name text NOT NULL, unit text NOT NULL,
 quantity bigint NOT NULL CHECK(quantity>0), unit_price bigint NOT NULL CHECK(unit_price>=0), subtotal bigint NOT NULL CHECK(subtotal>=0),
 PRIMARY KEY(order_id,product_id)
);
ALTER TABLE dairy.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE dairy.order_items FORCE ROW LEVEL SECURITY;
REVOKE ALL ON dairy.order_items FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON dairy.order_items TO hamro_server;
CREATE POLICY server_access ON dairy.order_items TO hamro_server USING(true) WITH CHECK(true);
CREATE FUNCTION dairy.capture_order_items() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 INSERT INTO dairy.order_items(order_id,product_id,name,unit,quantity,unit_price,subtotal)
 SELECT NEW.id,i->>'id',i->>'name',i->>'unit',(i->>'qty')::bigint,(i->>'price')::bigint,(i->>'subtotal')::bigint
 FROM jsonb_array_elements(NEW.payload::jsonb->'items') AS i;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION dairy.capture_order_items() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION dairy.capture_order_items() TO hamro_server;
CREATE TRIGGER capture_order_items AFTER INSERT ON dairy.orders FOR EACH ROW EXECUTE FUNCTION dairy.capture_order_items();
CREATE TABLE dairy.schema_version(version integer PRIMARY KEY, installed_at timestamptz NOT NULL DEFAULT now());
INSERT INTO dairy.schema_version(version) VALUES(1);
ALTER TABLE dairy.schema_version ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON dairy.schema_version FROM PUBLIC,anon,authenticated;
GRANT SELECT ON dairy.schema_version TO hamro_server;
CREATE POLICY server_read ON dairy.schema_version FOR SELECT TO hamro_server USING(true);
COMMENT ON SCHEMA dairy IS 'हाम्रो नेपाली डेरी — server-only orders, stock, delivery and customer data. Authentication stays in Supabase Auth.';
COMMENT ON TABLE dairy.orders IS 'Checkout snapshots and lifecycle. Customer passwords never belong here.';
COMMENT ON TABLE dairy.order_items IS 'Readable line items captured atomically on order insertion.';
