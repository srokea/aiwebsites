const { PLATFORM_TAGS } = require("../constants");

// Gramatyczne warianty per platforma, uzywane do podmiany frazy hooka
// w zaleznosci od tagu, ktory lead ma zaznaczony.
const PLATFORM_INFO = {
  instagram: {
    name: "Instagram",
    accusative: "Instagrama",
    onPhrase: "na Instagramie",
    profileNoun: "profil",
    objectionTitle: "Mam Instagrama i mi wystarcza",
  },
  facebook: {
    name: "Facebook",
    accusative: "Facebooka",
    onPhrase: "na Facebooku",
    profileNoun: "profil",
    objectionTitle: "Mam Facebooka i mi wystarcza",
  },
  booksy: {
    name: "Booksy",
    accusative: "Booksy",
    onPhrase: "przez Booksy",
    profileNoun: "profil",
    objectionTitle: "Mam Booksy i mi wystarcza",
  },
  youtube: {
    name: "YouTube",
    accusative: "YouTube'a",
    onPhrase: "na YouTube",
    profileNoun: "kanał",
    objectionTitle: "Mam kanał na YouTube i mi wystarcza",
  },
  tiktok: {
    name: "TikTok",
    accusative: "TikToka",
    onPhrase: "na TikToku",
    profileNoun: "profil",
    objectionTitle: "Mam TikToka i mi wystarcza",
  },
};

const DEFAULT_PRIORITY = ["instagram", "facebook", "booksy", "youtube", "tiktok"];

function activeTags(lead) {
  return PLATFORM_TAGS.filter((t) => lead[`tag_${t}`]);
}

// Wybiera tag "glowny" (do hooka) wg priorytetu, domyslnie Instagram gdy brak tagow
function pickPrimaryTag(lead, priority = DEFAULT_PRIORITY) {
  const active = activeTags(lead);
  const found = priority.find((t) => active.includes(t));
  return found || "instagram";
}

// Gdy lead ma wiecej niz jedna platforme, dorzuca do hooka krotka wzmianke o pozostalych
// (po nazwie, przecinkami - bez odmiany przez przypadki, zeby nie ryzykowac blednej gramatyki
// w wygenerowanym tekscie), podswietlona tak samo na niebiesko jak inne dynamiczne tokeny
// (<em>, patrz company/city w buildScript). Pusty string gdy nie ma nic do dopisania.
function otherPlatformsMention(lead, primary) {
  const others = activeTags(lead).filter((t) => t !== primary);
  if (!others.length) return "";
  const names = others.map((t) => PLATFORM_INFO[t].name).join(", ");
  return ` (są też na <em>${names}</em>)`;
}

module.exports = { PLATFORM_INFO, pickPrimaryTag, activeTags, otherPlatformsMention };
