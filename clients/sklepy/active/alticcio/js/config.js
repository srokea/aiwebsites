// Publiczna konfiguracja rezerwacji. Te wartości są jawne z założenia:
// klucz publishable (dawniej „anon”) ma dostęp tylko do tego, na co pozwalają RLS
// i granty z supabase/migrations/0003. Sekretów tu NIE wpisujemy — te żyją w
// zmiennych środowiskowych Cloudflare Pages (patrz functions/api/reserve.js).
//
// TODO przy wdrożeniu produkcyjnym: podmień TURNSTILE_SITE_KEY na klucz widgetu (na razie testowy).
export const SUPABASE_URL = 'https://wguownbxrppltpsbnfrb.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_qOTCljCUDj04G7Tv8B93FQ_WnaoeuRR';

// Klucz testowy Cloudflare — zawsze przepuszcza. Na produkcji podmień na klucz widgetu.
export const TURNSTILE_SITE_KEY = '1x00000000000000000000AA';

export const RESTAURANT_PHONE = '531 122 360';
export const RESTAURANT_PHONE_HREF = 'tel:+48531122360';
