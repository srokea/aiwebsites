// Wszystko, co panel właściciela robi z Supabase. js/panel.js dostaje ten obiekt z zewnątrz.
import { makeClient } from './supabase-client.js';
import { RESTAURANT_SLUG } from '../config.js';

export function createPanelApi() {
  const supabase = makeClient({ persistSession: true });
  // id restauracji z config.js (RESTAURANT_SLUG), ustalane przy sprawdzaniu uprawnień
  let restaurantId = null;

  const rpc = async (name, args) => {
    const { data, error } = await supabase.rpc(name, args);
    if (error) throw error;
    return data;
  };

  return {
    async getSession() {
      const { data } = await supabase.auth.getSession();
      return data.session;
    },

    /** cb(event, session). Zwraca funkcję wyrejestrowującą. */
    onAuthChange(cb) {
      const { data } = supabase.auth.onAuthStateChange((event, session) => {
        // supabase-js: nie wołać innych metod klienta synchronicznie wewnątrz tego callbacku
        // (grozi zakleszczeniem blokady sesji) — odkładamy na następny takt.
        setTimeout(() => cb(event, session), 0);
      });
      return () => data.subscription.unsubscribe();
    },

    async signIn(email, password) {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
    },

    async signOut() {
      await supabase.auth.signOut();
    },

    async sendPasswordReset(email) {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${location.origin}${location.pathname}`,
      });
      if (error) throw error;
    },

    async updatePassword(password) {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
    },

    /** Czy zalogowany obsługuje TĘ restaurację (slug ze strony). */
    async isStaff() {
      const mine = await rpc('my_restaurants');
      const match = (mine ?? []).find((r) => r.slug === RESTAURANT_SLUG);
      restaurantId = match?.id ?? null;
      return Boolean(match);
    },
    dayReservations: (date) => rpc('staff_reservations', { p_slug: RESTAURANT_SLUG, p_date: date }),
    cancel: (id) => rpc('cancel_reservation', { p_id: id }),

    /**
     * cb() przy każdej zmianie w rezerwacjach tej restauracji (filtr + RLS: tylko jej obsługa).
     * onStatus(live: boolean) — czy połączenie na żywo działa.
     */
    onReservationsChange(cb, onStatus) {
      const channel = supabase
        .channel('panel-reservations')
        .on('postgres_changes', {
          event: '*', schema: 'public', table: 'reservations',
          ...(restaurantId && { filter: `restaurant_id=eq.${restaurantId}` }),
        }, () => cb())
        .subscribe((status) => onStatus?.(status === 'SUBSCRIBED'));
      return () => supabase.removeChannel(channel);
    },
  };
}
