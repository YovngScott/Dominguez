-- Este módulo contiene documentos de seguros: no hereda la compatibilidad
-- histórica que trata una cuenta sin perfil como administrador.
drop policy if exists "administracion_lee_mensajes" on public.mensajes_dashboard;
drop policy if exists "administracion_actualiza_mensajes" on public.mensajes_dashboard;

create policy "administracion_lee_mensajes"
  on public.mensajes_dashboard for select to authenticated
  using (
    exists (
      select 1 from public.perfiles p
      where p.user_id = (select auth.uid())
        and p.rol = 'administrativo_general'
        and p.activo = true
    )
  );

create policy "administracion_actualiza_mensajes"
  on public.mensajes_dashboard for update to authenticated
  using (
    exists (
      select 1 from public.perfiles p
      where p.user_id = (select auth.uid())
        and p.rol = 'administrativo_general'
        and p.activo = true
    )
  )
  with check (
    exists (
      select 1 from public.perfiles p
      where p.user_id = (select auth.uid())
        and p.rol = 'administrativo_general'
        and p.activo = true
    )
  );
