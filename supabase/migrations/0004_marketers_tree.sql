-- =============================================================================
-- File 0004 — Marketers, Binary Genealogy Tree, Rank History
-- Purpose: The core of the model.
--          * marketers (binary placement parent_id+leg+sponsor_id, ltree path,
--            rank, status, registration_date, notes, soft-delete, audit cols)
--          * marketer_tree_closure (ancestor_id, descendant_id, depth, branch_leg)
--          * rank_history (immutable rank-change audit)
--          * ltree label helper uuid_label()
--          * closure + path maintenance triggers: cycle guard, AFTER INSERT,
--            AFTER MOVE (doc 14 §2)
--          * rank_history sync trigger (doc 01 §2.3)
--          * place_marketer() OPERATOR-DRIVEN exact-slot insert (ADR-001)
--          * move_marketer() admin-only re-placement (doc 14 §2.4)
--          * Adds the deferred memberships.marketer_id FK now that marketers exists.
--
-- Depends on: 0001_extensions.sql (ltree, btree_gist, pg_trgm),
--             0002_enums.sql (marketer_rank, marketer_status, placement_leg),
--             0003_tenancy_identity.sql (organizations, memberships)
--
-- ADR-001: placement is OPERATOR-DRIVEN ONLY. place_marketer() inserts at the
-- EXACT (p_parent_id, p_leg) slot and RAISES if occupied. There is NO spillover
-- and NO find_open_slot() in v1 (doc 14 §3.1-§3.3 deferred).
--
-- NOTE: place_marketer() / move_marketer() reference audit_log (created later in
-- the Group-6 analytics/ops migration). PL/pgSQL defers name resolution to call
-- time, so the functions create cleanly here; the audit insert is guarded with
-- to_regclass so it is a no-op until audit_log exists.
--
-- RLS is enabled/forced and policies are defined in 0006_rls_core.sql.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 2.1 marketers — the profile entity.
-- -----------------------------------------------------------------------------
CREATE TABLE public.marketers (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id             uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,

  -- Identity (profile-level; login lives in memberships/auth.users)
  first_name         text NOT NULL,
  last_name          text NOT NULL,
  display_name       text GENERATED ALWAYS AS (first_name || ' ' || last_name) STORED,
  email              text,            -- contact email on the profile; NOT the login credential
  phone              text,
  external_code      text,            -- the company's own marketer/affiliate code

  -- Binary placement genealogy
  parent_id          uuid REFERENCES public.marketers(id) ON DELETE RESTRICT, -- placement upline; NULL only for org root
  leg                placement_leg,   -- which leg of parent this node occupies; NULL only for org root
  sponsor_id         uuid REFERENCES public.marketers(id) ON DELETE SET NULL, -- recruiter; may differ from parent_id

  -- Materialized path for O(index) subtree/branch queries (maintained by trigger)
  path               ltree NOT NULL,

  -- Rank & status
  rank               marketer_rank   NOT NULL DEFAULT 'executive',
  status             marketer_status NOT NULL DEFAULT 'pending',

  -- Profile metadata
  registration_date  date NOT NULL DEFAULT current_date,
  notes              text,
  avatar_url         text,

  -- Audit
  created_by         uuid REFERENCES public.marketers(id),
  updated_by         uuid REFERENCES public.marketers(id),
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  deleted_at         timestamptz,

  -- Binary-tree integrity
  CONSTRAINT marketers_leg_requires_parent
    CHECK ((parent_id IS NULL AND leg IS NULL) OR (parent_id IS NOT NULL AND leg IS NOT NULL)),
  CONSTRAINT marketers_no_self_parent
    CHECK (parent_id IS NULL OR parent_id <> id),
  CONSTRAINT marketers_no_self_sponsor
    CHECK (sponsor_id IS NULL OR sponsor_id <> id)
);

COMMENT ON TABLE public.marketers IS
  'Marketer profile. Exists independently of any login (pre-registration). Binary placement (parent_id+leg) is separate from sponsorship (sponsor_id). A memberships row later attaches a login WITHOUT recreating this profile.';
COMMENT ON COLUMN public.marketers.sponsor_id IS
  'Recruiter (recruiting credit). Separate from parent_id (placement). May equal or differ from parent_id.';
COMMENT ON COLUMN public.marketers.path IS
  'ltree materialized root-to-node path; maintained transactionally by tree triggers. Subtree of N = path <@ N.path.';

-- ONE LEFT + ONE RIGHT child per parent, scoped to org. The binary constraint.
CREATE UNIQUE INDEX marketers_one_child_per_leg
  ON public.marketers (org_id, parent_id, leg)
  WHERE parent_id IS NOT NULL AND deleted_at IS NULL;

-- Exactly one root per org (the only row with NULL parent_id).
CREATE UNIQUE INDEX marketers_single_root_per_org
  ON public.marketers (org_id)
  WHERE parent_id IS NULL AND deleted_at IS NULL;

CREATE UNIQUE INDEX marketers_external_code_uq
  ON public.marketers (org_id, external_code)
  WHERE external_code IS NOT NULL AND deleted_at IS NULL;

-- Genealogy access indexes (doc 01 §2.1, doc 13).
CREATE INDEX marketers_path_gist   ON public.marketers USING gist (path);
CREATE INDEX marketers_parent_idx  ON public.marketers (org_id, parent_id);
CREATE INDEX marketers_sponsor_idx ON public.marketers (org_id, sponsor_id);
CREATE INDEX marketers_rank_status ON public.marketers (org_id, rank, status);
CREATE INDEX marketers_name_trgm   ON public.marketers USING gin (display_name gin_trgm_ops);

-- Now that marketers exists, attach the deferred memberships.marketer_id FK.
ALTER TABLE public.memberships
  ADD CONSTRAINT memberships_marketer_id_fkey
  FOREIGN KEY (marketer_id) REFERENCES public.marketers(id) ON DELETE CASCADE;

CREATE TRIGGER trg_marketers_updated_at
  BEFORE UPDATE ON public.marketers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 2.2 marketer_tree_closure — every (ancestor, descendant, depth) pair incl.
-- the self-row (depth 0). The single visibility + aggregation primitive.
-- -----------------------------------------------------------------------------
CREATE TABLE public.marketer_tree_closure (
  org_id        uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  ancestor_id   uuid NOT NULL REFERENCES public.marketers(id) ON DELETE CASCADE,
  descendant_id uuid NOT NULL REFERENCES public.marketers(id) ON DELETE CASCADE,
  depth         int  NOT NULL CHECK (depth >= 0),
  branch_leg    placement_leg,  -- NULL on the self-row (depth 0)
  PRIMARY KEY (ancestor_id, descendant_id),
  CONSTRAINT closure_branch_leg_rule
    CHECK ((depth = 0 AND branch_leg IS NULL) OR (depth > 0 AND branch_leg IS NOT NULL))
);

COMMENT ON TABLE public.marketer_tree_closure IS
  'Closure table over the binary placement tree (incl. self-row depth 0). branch_leg records, for ancestor N and descendant X, whether X hangs off N''s LEFT or RIGHT immediate child. The single visibility primitive for RLS and aggregation primitive for analytics.';

CREATE INDEX closure_descendant_idx ON public.marketer_tree_closure (descendant_id);
CREATE INDEX closure_ancestor_depth ON public.marketer_tree_closure (ancestor_id, depth);
CREATE INDEX closure_branch_idx     ON public.marketer_tree_closure (ancestor_id, branch_leg);
CREATE INDEX closure_org_idx        ON public.marketer_tree_closure (org_id);

-- -----------------------------------------------------------------------------
-- 2.3 rank_history — immutable audit of every rank change.
-- -----------------------------------------------------------------------------
CREATE TABLE public.rank_history (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  marketer_id    uuid NOT NULL REFERENCES public.marketers(id) ON DELETE CASCADE,
  previous_rank  marketer_rank,
  new_rank       marketer_rank NOT NULL,
  changed_at     timestamptz NOT NULL DEFAULT now(),
  changed_by     uuid REFERENCES public.marketers(id),
  notes          text,
  created_at     timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT rank_history_distinct CHECK (previous_rank IS DISTINCT FROM new_rank)
);

COMMENT ON TABLE public.rank_history IS
  'Immutable audit of every marketers.rank change. Written by trigger on marketers when rank changes. No manual writes.';

CREATE INDEX rank_history_marketer_idx
  ON public.rank_history (org_id, marketer_id, changed_at DESC);

-- =============================================================================
-- Tree maintenance: helpers, triggers, and operator-driven functions
-- =============================================================================

-- -----------------------------------------------------------------------------
-- ltree label encoding helper (uuid -> ltree-safe label). doc 14 §2.1
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.uuid_label(p_id uuid)
RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE
AS $$
  SELECT 'n' || replace(p_id::text, '-', '');
$$;

COMMENT ON FUNCTION public.uuid_label(uuid) IS
  'Encode a uuid as an ltree-safe label: strip hyphens, prefix "n". Used to build marketers.path labels.';

-- -----------------------------------------------------------------------------
-- Cycle guard — BEFORE INSERT OR UPDATE of structural columns. doc 14 §2.2
-- Enforces org-match (I8), self placement/sponsor (I4), and cycle prevention
-- on parent_id change (I5).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.marketers_cycle_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- I8: child must share the parent's org.
  IF NEW.parent_id IS NOT NULL THEN
    PERFORM 1 FROM public.marketers p
      WHERE p.id = NEW.parent_id AND p.org_id = NEW.org_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'parent_id % is not in org %', NEW.parent_id, NEW.org_id
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  -- I4: no self placement / self sponsor (defensive; also CHECK-enforced).
  IF NEW.parent_id = NEW.id OR NEW.sponsor_id = NEW.id THEN
    RAISE EXCEPTION 'node % cannot be its own parent/sponsor', NEW.id
      USING ERRCODE = 'check_violation';
  END IF;

  -- I5: on UPDATE of parent_id, reject if the new parent is inside NEW's subtree.
  IF TG_OP = 'UPDATE' AND NEW.parent_id IS DISTINCT FROM OLD.parent_id
     AND NEW.parent_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.marketer_tree_closure
      WHERE ancestor_id = NEW.id AND descendant_id = NEW.parent_id
    ) THEN
      RAISE EXCEPTION 'move would create a cycle: % is inside subtree of %',
        NEW.parent_id, NEW.id USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_marketers_cycle_guard
  BEFORE INSERT OR UPDATE OF parent_id, leg, sponsor_id, org_id ON public.marketers
  FOR EACH ROW EXECUTE FUNCTION public.marketers_cycle_guard();

-- -----------------------------------------------------------------------------
-- BEFORE INSERT — compute the ltree path so the NOT NULL column is satisfied for
-- BOTH place_marketer() and direct (PostgREST pre-registration) inserts. Fires
-- after the cycle guard (trigger-name order: "cycle" < "path"), so the parent/org
-- is already validated. The closure cross-product is built in the AFTER trigger.
-- (Resolves BUILD-REPORT O-1.)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.marketers_compute_path()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, extensions
AS $$
DECLARE
  v_parent_path ltree;
BEGIN
  IF NEW.path IS NOT NULL THEN
    RETURN NEW;  -- caller supplied an explicit path; respect it
  END IF;

  IF NEW.parent_id IS NULL THEN
    NEW.path := text2ltree(public.uuid_label(NEW.id));
  ELSE
    -- Parent existence/org is enforced by the cycle guard (fires first) and the
    -- FK; if the parent were missing this stays NULL and the statement aborts.
    SELECT path INTO v_parent_path FROM public.marketers WHERE id = NEW.parent_id;
    NEW.path := v_parent_path || text2ltree(public.uuid_label(NEW.id));
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_marketers_path_compute
  BEFORE INSERT ON public.marketers
  FOR EACH ROW EXECUTE FUNCTION public.marketers_compute_path();

-- -----------------------------------------------------------------------------
-- AFTER INSERT maintenance — closure cross-product. doc 14 §2.3
-- (path is set by the BEFORE INSERT trigger marketers_compute_path above.)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.marketers_after_insert_tree()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, extensions
AS $$
BEGIN
  -- 1) Closure: ancestor rows (depth d+1) for every ancestor of the parent.
  IF NEW.parent_id IS NOT NULL THEN
    INSERT INTO public.marketer_tree_closure (org_id, ancestor_id, descendant_id, depth, branch_leg)
    SELECT NEW.org_id, c.ancestor_id, NEW.id, c.depth + 1,
           CASE WHEN c.depth = 0 THEN NEW.leg ELSE c.branch_leg END
    FROM   public.marketer_tree_closure c
    WHERE  c.descendant_id = NEW.parent_id;
  END IF;

  -- 2) Self-row (depth 0, branch_leg NULL).
  INSERT INTO public.marketer_tree_closure (org_id, ancestor_id, descendant_id, depth, branch_leg)
  VALUES (NEW.org_id, NEW.id, NEW.id, 0, NULL);

  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_marketers_after_insert_tree
  AFTER INSERT ON public.marketers
  FOR EACH ROW EXECUTE FUNCTION public.marketers_after_insert_tree();

-- -----------------------------------------------------------------------------
-- AFTER MOVE maintenance — closure rewrite + ltree prefix splice. doc 14 §2.4
-- Fires only on UPDATE OF parent_id / leg (admin-only re-placement).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.marketers_after_move_tree()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, extensions
AS $$
DECLARE
  v_new_parent_path ltree;
  v_old_self_path   ltree;
BEGIN
  IF NEW.parent_id IS NOT DISTINCT FROM OLD.parent_id
     AND NEW.leg IS NOT DISTINCT FROM OLD.leg THEN
    RETURN NULL;  -- nothing structural changed
  END IF;

  -- A) Tear down closure links from PROPER ancestors of C to all nodes in C's
  --    subtree (internal subtree rows and self-rows are preserved).
  DELETE FROM public.marketer_tree_closure
  WHERE descendant_id IN (
          SELECT descendant_id FROM public.marketer_tree_closure WHERE ancestor_id = NEW.id
        )
    AND ancestor_id IN (
          SELECT ancestor_id FROM public.marketer_tree_closure
          WHERE descendant_id = NEW.id AND ancestor_id <> NEW.id
        );

  -- B) Rebuild: ancestors(P') x subtree(C), depth & branch_leg recomputed.
  IF NEW.parent_id IS NOT NULL THEN
    INSERT INTO public.marketer_tree_closure (org_id, ancestor_id, descendant_id, depth, branch_leg)
    SELECT NEW.org_id,
           up.ancestor_id,
           down.descendant_id,
           up.depth + 1 + down.depth,
           CASE WHEN up.depth = 0
                THEN COALESCE(down.branch_leg, NEW.leg)  -- side relative to C's NEW.leg
                ELSE up.branch_leg
           END
    FROM   public.marketer_tree_closure up
    JOIN   public.marketer_tree_closure down
           ON down.ancestor_id = NEW.id
    WHERE  up.descendant_id = NEW.parent_id;
  END IF;

  -- C) ltree prefix rewrite for C and every descendant.
  SELECT path INTO v_old_self_path FROM public.marketers WHERE id = NEW.id;
  IF NEW.parent_id IS NULL THEN
    v_new_parent_path := NULL;
  ELSE
    SELECT path INTO v_new_parent_path FROM public.marketers WHERE id = NEW.parent_id;
  END IF;

  UPDATE public.marketers m
  SET path = CASE
               WHEN v_new_parent_path IS NULL
                 THEN text2ltree(public.uuid_label(NEW.id)) ||
                      subpath(m.path, nlevel(v_old_self_path))      -- new root
               ELSE v_new_parent_path ||
                      subpath(m.path, nlevel(v_old_self_path) - 1)  -- splice new prefix
             END
  WHERE m.path <@ v_old_self_path;  -- C and all descendants (old subtree)

  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_marketers_after_move_tree
  AFTER UPDATE OF parent_id, leg ON public.marketers
  FOR EACH ROW EXECUTE FUNCTION public.marketers_after_move_tree();

-- -----------------------------------------------------------------------------
-- rank_history sync — AFTER INSERT/UPDATE of rank on marketers. doc 01 §2.3
-- Writes a history row on first assignment and on every change.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.marketers_rank_history_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- First assignment: previous_rank NULL.
    INSERT INTO public.rank_history (org_id, marketer_id, previous_rank, new_rank, changed_by)
    VALUES (NEW.org_id, NEW.id, NULL, NEW.rank, NEW.updated_by);
  ELSIF TG_OP = 'UPDATE' AND NEW.rank IS DISTINCT FROM OLD.rank THEN
    INSERT INTO public.rank_history (org_id, marketer_id, previous_rank, new_rank, changed_by)
    VALUES (NEW.org_id, NEW.id, OLD.rank, NEW.rank, NEW.updated_by);
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_marketers_rank_history_insert
  AFTER INSERT ON public.marketers
  FOR EACH ROW EXECUTE FUNCTION public.marketers_rank_history_sync();

CREATE TRIGGER trg_marketers_rank_history_update
  AFTER UPDATE OF rank ON public.marketers
  FOR EACH ROW EXECUTE FUNCTION public.marketers_rank_history_sync();

-- -----------------------------------------------------------------------------
-- place_marketer() — ADR-001 OPERATOR-DRIVEN exact-slot placement.
-- Inserts the marketers row at the EXACT (p_parent_id, p_leg) slot and RAISES
-- if that slot is occupied. NO spillover, NO find_open_slot(). The partial
-- unique index marketers_one_child_per_leg is the hard backstop.
--
-- For the ORG ROOT, pass p_parent_id = NULL and p_leg = NULL.
-- sponsor_id is recorded independently of placement (recruiting credit).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.place_marketer(
  p_org_id      uuid,
  p_parent_id   uuid,                 -- exact placement parent (NULL = org root)
  p_leg         placement_leg,        -- exact leg (NULL = org root)
  p_sponsor_id  uuid,                 -- recruiter (gets the credit); may differ from parent
  p_name        text,                 -- first_name
  p_surname     text,                 -- last_name
  p_rank        marketer_rank DEFAULT 'executive',
  p_status      marketer_status DEFAULT 'pending',
  p_created_by  uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SET search_path = public, extensions
AS $$
DECLARE
  v_new_id    uuid := gen_random_uuid();
BEGIN
  -- Root vs placed-node argument consistency (mirrors marketers_leg_requires_parent).
  IF (p_parent_id IS NULL) <> (p_leg IS NULL) THEN
    RAISE EXCEPTION 'place_marketer: parent_id and leg must both be NULL (root) or both set'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Serialize concurrent placements under the same parent slot. Even with the
  -- advisory lock, the partial unique index is the ultimate guard against a
  -- double-fill (two recruits racing for the same leg).
  IF p_parent_id IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(
      hashtextextended(p_org_id::text || p_parent_id::text || p_leg::text, 0));

    -- Operator-driven: the slot must be EXACTLY free. Friendly pre-check; the
    -- unique index enforces it for real under concurrency.
    IF EXISTS (
      SELECT 1 FROM public.marketers
      WHERE org_id = p_org_id
        AND parent_id = p_parent_id
        AND leg = p_leg
        AND deleted_at IS NULL
    ) THEN
      RAISE EXCEPTION 'placement slot (parent=%, leg=%) is already occupied (ADR-001: no spillover)',
        p_parent_id, p_leg
        USING ERRCODE = 'unique_violation';
    END IF;
  END IF;

  -- path is intentionally omitted: the BEFORE INSERT trigger marketers_compute_path()
  -- derives it from the parent (works for this RPC and for direct PostgREST inserts).
  INSERT INTO public.marketers (
    id, org_id, first_name, last_name,
    parent_id, leg, sponsor_id,
    rank, status, created_by, updated_by
  ) VALUES (
    v_new_id, p_org_id, p_name, p_surname,
    p_parent_id, p_leg, p_sponsor_id,
    p_rank, p_status, p_created_by, p_created_by
  );

  -- Audit (closure/path already maintained by AFTER INSERT trigger in this txn).
  -- audit_log is created in a later migration; guard so this is a no-op until then.
  IF to_regclass('public.audit_log') IS NOT NULL THEN
    INSERT INTO public.audit_log (org_id, actor_marketer_id, action, entity_type, entity_id, after)
    VALUES (p_org_id, p_created_by, 'marketer.place', 'marketers', v_new_id,
            jsonb_build_object('parent_id', p_parent_id, 'leg', p_leg,
                               'sponsor_id', p_sponsor_id));
  END IF;

  RETURN v_new_id;
END;
$$;

COMMENT ON FUNCTION public.place_marketer(uuid, uuid, placement_leg, uuid, text, text, marketer_rank, marketer_status, uuid) IS
  'ADR-001 operator-driven placement: inserts a marketers row at the EXACT (parent_id, leg) slot and RAISES if occupied. No spillover, no slot-finding. Closure + ltree path maintained by triggers transactionally.';

-- -----------------------------------------------------------------------------
-- move_marketer() — admin-only re-placement (doc 14 §2.4 / §7).
-- Validates slot-free + acyclic, then updates parent_id/leg; the AFTER MOVE
-- trigger rewrites closure + path in the same transaction. Audited.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.move_marketer(
  p_org_id      uuid,
  p_marketer_id uuid,                 -- node C being moved
  p_new_parent  uuid,                 -- new placement parent P'
  p_new_leg     placement_leg,        -- new leg L'
  p_actor       uuid DEFAULT NULL     -- acting marketer (for audit)
) RETURNS void
LANGUAGE plpgsql
SET search_path = public, extensions
AS $$
DECLARE
  v_old_parent uuid;
  v_old_leg    placement_leg;
  v_old_path   ltree;
BEGIN
  IF (p_new_parent IS NULL) <> (p_new_leg IS NULL) THEN
    RAISE EXCEPTION 'move_marketer: new parent and leg must both be NULL (root) or both set'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT parent_id, leg, path
    INTO v_old_parent, v_old_leg, v_old_path
  FROM public.marketers
  WHERE id = p_marketer_id AND org_id = p_org_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'move_marketer: node % not found in org %', p_marketer_id, p_org_id;
  END IF;

  -- Serialize against concurrent placements/moves into the destination slot.
  IF p_new_parent IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(
      hashtextextended(p_org_id::text || p_new_parent::text || p_new_leg::text, 0));

    -- Cycle pre-check (the cycle guard trigger also enforces this).
    IF EXISTS (
      SELECT 1 FROM public.marketer_tree_closure
      WHERE ancestor_id = p_marketer_id AND descendant_id = p_new_parent
    ) THEN
      RAISE EXCEPTION 'move_marketer: % is inside the subtree of % (cycle)', p_new_parent, p_marketer_id
        USING ERRCODE = 'check_violation';
    END IF;

    -- Destination slot must be free (unique index is the hard guard).
    IF EXISTS (
      SELECT 1 FROM public.marketers
      WHERE org_id = p_org_id
        AND parent_id = p_new_parent
        AND leg = p_new_leg
        AND deleted_at IS NULL
        AND id <> p_marketer_id
    ) THEN
      RAISE EXCEPTION 'move_marketer: destination slot (parent=%, leg=%) is occupied',
        p_new_parent, p_new_leg
        USING ERRCODE = 'unique_violation';
    END IF;
  END IF;

  -- Perform the structural update; AFTER MOVE trigger rewrites closure + path.
  UPDATE public.marketers
  SET parent_id = p_new_parent,
      leg       = p_new_leg,
      updated_by = COALESCE(p_actor, updated_by)
  WHERE id = p_marketer_id;

  -- Audit. Guarded until audit_log exists (later migration).
  IF to_regclass('public.audit_log') IS NOT NULL THEN
    INSERT INTO public.audit_log (org_id, actor_marketer_id, action, entity_type, entity_id, before, after)
    VALUES (p_org_id, p_actor, 'marketer.move', 'marketers', p_marketer_id,
            jsonb_build_object('parent_id', v_old_parent, 'leg', v_old_leg, 'path', v_old_path::text),
            jsonb_build_object('parent_id', p_new_parent, 'leg', p_new_leg));
  END IF;
END;
$$;

COMMENT ON FUNCTION public.move_marketer(uuid, uuid, uuid, placement_leg, uuid) IS
  'Admin-only re-placement: validates destination slot is free + acyclic, updates parent_id/leg (AFTER MOVE trigger rewrites closure + ltree path transactionally). Audited as marketer.move.';
