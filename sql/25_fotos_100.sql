-- =========================================================
-- 25_fotos_100.sql
-- Sube el máximo de fotos por caso de 50 a 100. Solo reemplaza la función
-- del trigger (el trigger ya existe y la sigue usando).
-- ▶ Ejecuta UNA vez en el SQL Editor de Supabase.
-- =========================================================

create or replace function check_max_fotos()
returns trigger as $$
begin
  if (select count(*) from fotos_caso where caso_id = new.caso_id) >= 100 then
    raise exception 'Este caso ya alcanzó el máximo de 100 fotos permitidas';
  end if;
  return new;
end;
$$ language plpgsql;
