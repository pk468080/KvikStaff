
REVOKE EXECUTE ON FUNCTION
public.admin_update_worker(
    uuid,
    text,
    text,
    public.worker_status,
    boolean,
    numeric,
    boolean,
    uuid[]
)
FROM anon;

REVOKE EXECUTE ON FUNCTION
public.admin_update_worker(
    uuid,
    text,
    text,
    public.worker_status,
    boolean,
    numeric,
    boolean,
    uuid[]
)
FROM PUBLIC;
;
