// Publiczna konfiguracja rezerwacji RSaaS dla tej strony. Te wartości są jawne z założenia:
// klucz publishable (dawniej „anon”) ma dostęp tylko do tego, na co pozwalają RLS
// i granty z rsaas/supabase/migrations/0003. Sekretów tu NIE wpisujemy — te żyją w
// zmiennych środowiskowych Cloudflare Pages (patrz rsaas/README.md).
//
// Wspólny kod (rsaas/client/, w dist/js/rsaas/) importuje ten plik jako '../config.js'.
//
// Slug restauracji w bazie RSaaS. Musi być równy RESTAURANT_SLUG w zmiennych Cloudflare Pages.
export const RESTAURANT_SLUG = 'alticcio';

export const SUPABASE_URL = 'https://vjhlqymdfglqmyudvcpc.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_Lh3pC54tMmWEuQXUp_8MYw_A0K9_BI0';

// Widget Turnstile „Alticcio” (hostname alticcio.pages.dev). Klucz publiczny z założenia.
// Lokalnie (wrangler pages dev) działa tylko z testowym: '1x00000000000000000000AA'.
export const TURNSTILE_SITE_KEY = '0x4AAAAAAF8uHxyNw9fuAbfJ';

export const RESTAURANT_PHONE = '531 122 360';
export const RESTAURANT_PHONE_HREF = 'tel:+48531122360';
