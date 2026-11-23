BEGIN;
CREATE TABLE public.max_accounts (
 user_id uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
 max_user_id bigint UNIQUE, chat_id bigint, username text, first_name text, last_name text,
 notifications_enabled boolean NOT NULL DEFAULT true, linked_at timestamptz, unlinked_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CONSTRAINT max_accounts_ids_check CHECK ((max_user_id IS NULL OR max_user_id > 0) AND (chat_id IS NULL OR chat_id > 0)),
 CONSTRAINT max_accounts_link_state_check CHECK (
  (max_user_id IS NOT NULL AND chat_id IS NOT NULL AND linked_at IS NOT NULL AND unlinked_at IS NULL)
  OR (max_user_id IS NULL AND chat_id IS NULL AND linked_at IS NULL AND unlinked_at IS NOT NULL)
 )
);
CREATE TABLE public.max_link_codes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
 code_hash text NOT NULL UNIQUE, expires_at timestamptz NOT NULL, used_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CONSTRAINT max_link_codes_hash_check CHECK (code_hash ~ '^[0-9a-f]{64}$')
);
CREATE UNIQUE INDEX max_link_codes_one_active_per_user_idx ON public.max_link_codes(user_id) WHERE used_at IS NULL;
CREATE INDEX max_link_codes_expiry_idx ON public.max_link_codes(expires_at) WHERE used_at IS NULL;
CREATE TABLE public.max_updates (
 event_key text PRIMARY KEY, update_type text NOT NULL, payload jsonb NOT NULL,
 status text NOT NULL DEFAULT 'received', attempts integer NOT NULL DEFAULT 1,
 received_at timestamptz NOT NULL DEFAULT clock_timestamp(), processed_at timestamptz, last_error text,
 CONSTRAINT max_updates_event_key_check CHECK (event_key ~ '^[0-9a-f]{64}$'),
 CONSTRAINT max_updates_type_check CHECK (char_length(update_type) BETWEEN 1 AND 64),
 CONSTRAINT max_updates_status_check CHECK (status IN ('received','processed','failed','ignored')),
 CONSTRAINT max_updates_attempts_check CHECK (attempts >= 0)
);
CREATE INDEX max_updates_received_at_idx ON public.max_updates(received_at DESC);
ALTER TABLE public.max_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.max_link_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.max_updates ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.max_accounts FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.max_link_codes FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.max_updates FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.max_accounts TO service_role;
GRANT ALL ON TABLE public.max_link_codes TO service_role;
GRANT ALL ON TABLE public.max_updates TO service_role;

CREATE OR REPLACE FUNCTION public.create_max_link_code(p_user_id uuid,p_code_hash text,p_expires_at timestamptz)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE v_code_id uuid; v_now timestamptz := pg_catalog.clock_timestamp();
BEGIN
 IF p_user_id IS NULL THEN RAISE EXCEPTION 'Invalid user ID'; END IF;
 IF p_code_hash IS NULL OR p_code_hash !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'Invalid MAX link code hash'; END IF;
 IF p_expires_at IS NULL OR p_expires_at <= v_now + interval '1 minute' OR p_expires_at > v_now + interval '15 minutes' THEN
  RAISE EXCEPTION 'Invalid MAX link code expiration';
 END IF;
 PERFORM 1 FROM public.users WHERE id=p_user_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'User not found'; END IF;
 UPDATE public.max_link_codes SET used_at=v_now WHERE user_id=p_user_id AND used_at IS NULL;
 INSERT INTO public.max_link_codes(user_id,code_hash,expires_at) VALUES(p_user_id,p_code_hash,p_expires_at) RETURNING id INTO v_code_id;
 RETURN v_code_id;
END;
$function$;
REVOKE ALL ON FUNCTION public.create_max_link_code(uuid,text,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.create_max_link_code(uuid,text,timestamptz) TO service_role;

CREATE OR REPLACE FUNCTION public.process_max_update(
 p_event_key text,p_update_type text,p_payload jsonb,p_code_hash text,
 p_max_user_id bigint,p_chat_id bigint,p_username text,p_first_name text,p_last_name text
)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE
 v_now timestamptz := pg_catalog.clock_timestamp();
 v_code public.max_link_codes%ROWTYPE;
 v_existing_user_id uuid; v_existing_max_user_id bigint; v_existing_unlinked_at timestamptz;
 v_linked_user_id uuid; v_inserted integer; v_safe_payload jsonb;
BEGIN
 IF p_event_key IS NULL OR p_event_key !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'Invalid MAX event key'; END IF;
 IF p_update_type IS NULL OR char_length(p_update_type) NOT BETWEEN 1 AND 64 THEN RAISE EXCEPTION 'Invalid MAX update type'; END IF;
 IF p_payload IS NULL OR pg_catalog.jsonb_typeof(p_payload)<>'object' THEN RAISE EXCEPTION 'Invalid MAX update payload'; END IF;
 IF p_code_hash IS NOT NULL AND p_code_hash !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'Invalid MAX link code hash'; END IF;
 IF p_code_hash IS NOT NULL AND p_update_type<>'bot_started' THEN RAISE EXCEPTION 'Link code is allowed only for bot_started'; END IF;
 IF p_update_type IN ('bot_started','bot_stopped') AND (p_max_user_id IS NULL OR p_max_user_id<=0) THEN RAISE EXCEPTION 'Invalid MAX user ID'; END IF;
 IF p_update_type='bot_started' AND (p_chat_id IS NULL OR p_chat_id<=0) THEN RAISE EXCEPTION 'Invalid MAX chat ID'; END IF;

 v_safe_payload := pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
  'timestamp',p_payload->'timestamp','chat_id',p_payload->'chat_id',
  'max_user_id',p_payload#>'{user,user_id}'
 ));
 INSERT INTO public.max_updates(event_key,update_type,payload,status,attempts)
 VALUES(p_event_key,p_update_type,v_safe_payload,'received',1)
 ON CONFLICT(event_key) DO NOTHING;
 GET DIAGNOSTICS v_inserted=ROW_COUNT;
 IF v_inserted=0 THEN RETURN 'duplicate'; END IF;

 IF p_update_type NOT IN ('bot_started','bot_stopped') THEN
  UPDATE public.max_updates SET status='ignored',processed_at=v_now,last_error=NULL WHERE event_key=p_event_key;
  RETURN 'ignored';
 END IF;

 IF p_update_type='bot_stopped' THEN
  UPDATE public.max_accounts SET notifications_enabled=false,updated_at=v_now
  WHERE max_user_id=p_max_user_id AND unlinked_at IS NULL;
  IF FOUND THEN
   UPDATE public.max_updates SET status='processed',processed_at=v_now,last_error=NULL WHERE event_key=p_event_key;
   RETURN 'notifications_disabled';
  END IF;
  UPDATE public.max_updates SET status='ignored',processed_at=v_now,last_error='max_account_not_linked' WHERE event_key=p_event_key;
  RETURN 'ignored';
 END IF;

 IF p_code_hash IS NULL THEN
  UPDATE public.max_accounts SET chat_id=p_chat_id,
   username=NULLIF(pg_catalog.left(pg_catalog.btrim(p_username),128),''),
   first_name=NULLIF(pg_catalog.left(pg_catalog.btrim(p_first_name),128),''),
   last_name=NULLIF(pg_catalog.left(pg_catalog.btrim(p_last_name),128),''),
   notifications_enabled=true,updated_at=v_now
  WHERE max_user_id=p_max_user_id AND unlinked_at IS NULL
  RETURNING user_id INTO v_linked_user_id;
  IF NOT FOUND THEN
   UPDATE public.max_updates SET status='ignored',processed_at=v_now,last_error='max_account_not_linked' WHERE event_key=p_event_key;
   RETURN 'not_linked';
  END IF;
  UPDATE public.max_updates SET status='processed',processed_at=v_now,last_error=NULL WHERE event_key=p_event_key;
  RETURN 'resumed';
 END IF;

 SELECT * INTO v_code FROM public.max_link_codes WHERE code_hash=p_code_hash AND used_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN
  UPDATE public.max_updates SET status='failed',processed_at=v_now,last_error='invalid_or_used_link_code' WHERE event_key=p_event_key;
  RETURN 'invalid_code';
 END IF;
 IF v_code.expires_at<=v_now THEN
  UPDATE public.max_link_codes SET used_at=v_now WHERE id=v_code.id AND used_at IS NULL;
  UPDATE public.max_updates SET status='failed',processed_at=v_now,last_error='expired_link_code' WHERE event_key=p_event_key;
  RETURN 'expired';
 END IF;

 SELECT max_user_id,unlinked_at INTO v_existing_max_user_id,v_existing_unlinked_at
 FROM public.max_accounts WHERE user_id=v_code.user_id FOR UPDATE;
 IF FOUND AND v_existing_max_user_id IS NOT NULL AND v_existing_unlinked_at IS NULL AND v_existing_max_user_id<>p_max_user_id THEN
  UPDATE public.max_link_codes SET used_at=v_now WHERE id=v_code.id;
  UPDATE public.max_updates SET status='failed',processed_at=v_now,last_error='ponglab_account_already_linked' WHERE event_key=p_event_key;
  RETURN 'account_already_linked';
 END IF;

 SELECT user_id INTO v_existing_user_id FROM public.max_accounts
 WHERE max_user_id=p_max_user_id AND unlinked_at IS NULL FOR UPDATE;
 IF FOUND AND v_existing_user_id<>v_code.user_id THEN
  UPDATE public.max_link_codes SET used_at=v_now WHERE id=v_code.id;
  UPDATE public.max_updates SET status='failed',processed_at=v_now,last_error='max_account_already_linked' WHERE event_key=p_event_key;
  RETURN 'max_account_already_linked';
 END IF;

 BEGIN
  INSERT INTO public.max_accounts(
   user_id,max_user_id,chat_id,username,first_name,last_name,
   notifications_enabled,linked_at,unlinked_at,created_at,updated_at
  ) VALUES(
   v_code.user_id,p_max_user_id,p_chat_id,
   NULLIF(pg_catalog.left(pg_catalog.btrim(p_username),128),''),
   NULLIF(pg_catalog.left(pg_catalog.btrim(p_first_name),128),''),
   NULLIF(pg_catalog.left(pg_catalog.btrim(p_last_name),128),''),
   true,v_now,NULL,v_now,v_now
  )
  ON CONFLICT(user_id) DO UPDATE SET
   max_user_id=EXCLUDED.max_user_id,chat_id=EXCLUDED.chat_id,
   username=EXCLUDED.username,first_name=EXCLUDED.first_name,last_name=EXCLUDED.last_name,
   notifications_enabled=true,
   linked_at=CASE WHEN public.max_accounts.max_user_id IS NULL OR public.max_accounts.unlinked_at IS NOT NULL
     THEN EXCLUDED.linked_at ELSE public.max_accounts.linked_at END,
   unlinked_at=NULL,updated_at=EXCLUDED.updated_at
  WHERE public.max_accounts.max_user_id IS NULL
     OR public.max_accounts.unlinked_at IS NOT NULL
     OR public.max_accounts.max_user_id=EXCLUDED.max_user_id
  RETURNING user_id INTO v_linked_user_id;
 EXCEPTION WHEN unique_violation THEN
  UPDATE public.max_link_codes SET used_at=v_now WHERE id=v_code.id;
  UPDATE public.max_updates SET status='failed',processed_at=v_now,last_error='max_account_already_linked' WHERE event_key=p_event_key;
  RETURN 'max_account_already_linked';
 END;

 IF v_linked_user_id IS NULL THEN
  UPDATE public.max_link_codes SET used_at=v_now WHERE id=v_code.id;
  UPDATE public.max_updates SET status='failed',processed_at=v_now,last_error='ponglab_account_already_linked' WHERE event_key=p_event_key;
  RETURN 'account_already_linked';
 END IF;

 UPDATE public.max_link_codes SET used_at=v_now WHERE id=v_code.id AND used_at IS NULL;
 UPDATE public.max_updates SET status='processed',processed_at=v_now,last_error=NULL WHERE event_key=p_event_key;
 RETURN 'linked';
END;
$function$;
REVOKE ALL ON FUNCTION public.process_max_update(text,text,jsonb,text,bigint,bigint,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.process_max_update(text,text,jsonb,text,bigint,bigint,text,text,text) TO service_role;
COMMIT;
