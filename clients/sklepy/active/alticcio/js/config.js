// Publiczna konfiguracja rezerwacji RSaaS dla tej strony. Te wartości są jawne z założenia:
// klucz publishable (dawniej „anon”) ma dostęp tylko do tego, na co pozwalają RLS
// i granty z rsaas/supabase/migrations/0003. Sekretów tu NIE wpisujemy — te żyją w
// zmiennych środowiskowych Cloudflare Pages (patrz rsaas/README.md).
//
// Wspólny kod (rsaas/client/, w dist/js/rsaas/) importuje ten plik jako '../config.js'.
//
// TODO przy wdrożeniu produkcyjnym: podmień TURNSTILE_SITE_KEY na klucz widgetu (na razie testowy).
// Slug restauracji w bazie RSaaS. Musi być równy RESTAURANT_SLUG w zmiennych Cloudflare Pages.
export const RESTAURANT_SLUG = 'alticcio';

export const SUPABASE_URL = 'https://vjhlqymdfglqmyudvcpc.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_Lh3pC54tMmWEuQXUp_8MYw_A0K9_BI0';

// Klucz testowy Cloudflare — zawsze przepuszcza. Na produkcji podmień na klucz widgetu.
export const TURNSTILE_SITE_KEY = '1x00000000000000000000AA';

export const RESTAURANT_PHONE = '531 122 360';
export const RESTAURANT_PHONE_HREF = 'tel:+48531122360';
