const { PLATFORM_INFO, pickPrimaryTag, activeTags, otherPlatformsMention } = require("./platformTokens");
const { escapeHtml } = require("../text");

function buildScript(lead) {
  const primary = pickPrimaryTag(lead);
  const p = PLATFORM_INFO[primary];
  const active = activeTags(lead);
  const hasYoutubeToo = active.includes("youtube") && primary !== "youtube";
  // brak jakichkolwiek tagow social -> nie zmyslamy platformy (pickPrimaryTag domyslnie
  // dawalby Instagram), tylko ogolne "w Internecie"; profileNoun/onPhrase zawsze przez
  // <em> - tak samo jak company/city/platform - zeby podswietlenie na niebiesko bylo spojne
  const noSocial = active.length === 0;

  const company = lead.company_name ? `<em>${escapeHtml(lead.company_name)}</em>` : "<em>nazwa firmy</em>";
  const city = lead.city ? `<em>${escapeHtml(lead.city)}</em>` : "<em>miejscowość</em>";
  const platform = `<em>${p.name}</em>`;
  const otherPlatforms = otherPlatformsMention(lead, primary);
  const foundPhrase = noSocial ? "Was <em>w Internecie</em>" : `Wasz <em>${p.profileNoun}</em> <em>${p.onPhrase}</em>`;

  const sections = [
    {
      phase: 1,
      phaseClass: "phase-1",
      title: "Opener",
      content: [
        { type: "text", speaker: "you", html: `Dzień dobry, dodzwoniłem się do ${company}?` },
        { type: "text", speaker: "you", html: "Super. A mogę rozmawiać z właścicielem / właścicielką?" },
        { type: "flowArrow" },
        {
          type: "branch",
          dot: "no",
          title: "NIE – to nie właściciel/ka",
          open: false,
          content: [
            { type: "text", speaker: "you", html: "Jasne, a kiedy mogę się z nim / z nią skontaktować?" },
            { type: "text", speaker: "them", html: "Proszę zadzwonić później / to ja robię zdjęcia, ale numer jest firmowy." },
            { type: "divider" },
            { type: "text", speaker: "them", html: "A w jakiej sprawie Pan dzwoni?" },
            { type: "text", speaker: "you", html: `Dzwonię w sprawie strony internetowej / ${platform}.` },
          ],
        },
        {
          type: "branch",
          dot: "yes",
          title: "TAK – rozmawiam z właścicielem/ką",
          open: true,
          content: [
            { type: "hookTag", variant: "main", label: `Główny hook – ${p.name}` },
            {
              type: "text",
              speaker: "you",
              html: `Super. Trafiłem ostatnio na ${foundPhrase}${otherPlatforms} i bardzo spodobały mi się realizacje. Zauważyłem też, że nie ma Pan/Pani obecnie własnej strony internetowej. Jestem studentem, zajmuję się tworzeniem stron i rozbudowuję teraz swoje portfolio, dlatego przygotowałem dla Pana/Pani szybki koncept strony z portfolio, pakietami, opiniami i kontaktem. Zamiast opowiadać o tym przez telefon, wolałbym po prostu to pokazać. Umówilibyśmy się na krótkie spotkanie online, wysłałbym Panu/Pani link, udostępnił ekran i pokazał koncept. W trakcie może Pan/Pani powiedzieć, co warto zmienić, a ja na bieżąco bym to dopracował. Miałby/Miałaby Pan/Pani 10–15 minut w którymś dniu?`,
            },
          ],
        },
      ],
    },
    {
      phase: 2,
      phaseClass: "phase-2",
      title: "Wykruszenie – obiekcje",
      content: [
        {
          type: "branch",
          dot: "objection",
          title: "Nie jesteśmy zainteresowani",
          content: [
            { type: "text", speaker: "you", html: "Jasne, rozumiem. Z ciekawości zapytam tylko – chodzi np. o budżet, czy po prostu nie jest to teraz priorytet?" },
          ],
        },
        {
          type: "branch",
          dot: "objection",
          title: p.objectionTitle,
          content: [
            { type: "note", html: "⚡ Najczęstsza obiekcja u fotografów" },
            {
              type: "text",
              speaker: "you",
              html: `Rozumiem, i to super że tam macie ruch – zdjęcia wyglądają naprawdę dobrze. Różnica jest taka, że ktoś szukający konkretnie „fotograf ${city}" w Google trafia na strony, nie na profil ${p.name === "Instagram" || p.name === "Facebook" ? "społecznościowy" : platform}. Strona zbiera portfolio, pakiety, cennik i opinie w jednym miejscu i pokazuje się właśnie w takich wyszukiwaniach. Czy byłby Pan / byłaby Pani otwarty/a zobaczyć przykładowy koncept?`,
            },
          ],
        },
        {
          type: "branch",
          dot: "objection",
          title: "Klienci i tak przychodzą z polecenia",
          content: [
            {
              type: "text",
              speaker: "you",
              html: "Rozumiem, polecenia to najlepsze źródło klientów. Różnica jest taka, że polecony klient i tak sprawdza Was potem w Google, zanim napisze – jeśli trafi tylko na urywkowe zdjęcia w mediach społecznościowych zamiast pełnego portfolio i cennika pakietów, część z nich po prostu zrezygnuje po drodze. Strona to zabezpiecza.",
            },
          ],
        },
        ...(hasYoutubeToo
          ? [
              {
                type: "branch",
                dot: "objection",
                title: "Mamy kanał na YouTube",
                content: [
                  {
                    type: "text",
                    speaker: "you",
                    html: "Jasne, i to świetnie sprawdza się do pokazywania materiałów wideo / making-of. Strona miałaby być miejscem, gdzie klient najpierw zobaczy pełne portfolio zdjęć, pakiety i cennik – i dopiero stamtąd jednym kliknięciem przejdzie do Waszych filmów na YouTube.",
                  },
                ],
              },
            ]
          : []),
        {
          type: "branch",
          dot: "objection",
          title: "Nie mam czasu",
          content: [{ type: "text", speaker: "you", html: "Jasne, rozumiem. W takim razie zadzwonię wieczorem / w innym terminie?" }],
        },
        {
          type: "branch",
          dot: "objection",
          title: "Ile to kosztuje?",
          content: [
            {
              type: "text",
              speaker: "you",
              html: "W większości przypadków jest to 300-500 zł za przygotowanie strony i niewielki koszt miesięczny za utrzymanie, aktualizacje zdjęć i opiekę – to około 100-200 zł. Najpierw chciałbym jednak pokazać przygotowany koncept i sprawdzić, czy w ogóle odpowiadałby taki kierunek.",
            },
          ],
        },
        {
          type: "branch",
          dot: "objection",
          title: "Muszę to przemyśleć",
          content: [
            { type: "text", speaker: "you", html: "Jasne, rozumiem. Mogę tylko zapytać, co konkretnie chciałby Pan / chciałaby Pani przemyśleć?" },
            { type: "divider" },
            {
              type: "branch",
              dot: "neutral",
              title: "Nie wiem czy potrzebuję strony",
              content: [
                {
                  type: "text",
                  speaker: "you",
                  html: "Rozumiem. Dlatego właśnie proponuję krótkie spotkanie, żebym pokazał konkretny przykład na Waszych zdjęciach. Potem będzie dużo łatwiej ocenić, czy ma to sens.",
                },
              ],
            },
            {
              type: "branch",
              dot: "neutral",
              title: "Muszę pogadać ze wspólnikiem / z żoną / mężem",
              content: [
                { type: "text", speaker: "you", html: "Jasne. Kiedy mniej więcej będzie okazja o tym porozmawiać?" },
                { type: "text", speaker: "them", html: "Jutro." },
                { type: "text", speaker: "you", html: "Świetnie. To może odezwę się w czwartek po południu?" },
              ],
            },
            {
              type: "branch",
              dot: "no",
              title: "Kwestia pieniędzy",
              content: [
                {
                  type: "text",
                  speaker: "you",
                  html: "Jasne, rozumiem. A mogę zapytać z ciekawości – bardziej chodzi o cenę, czy nie jest Pan / Pani pewien/pewna, czy taka strona miałaby sens?",
                },
                { type: "dropWarning", html: "🚫 Jeśli cena jest problemem – dropujemy klienta" },
                { type: "divider" },
                { type: "text", speaker: "them", html: "Nie no, cena nie jest problemem." },
                {
                  type: "text",
                  speaker: "you",
                  html: "Okej. A gdyby nic nie kosztowało obejrzenie przykładu przez 10 minut, byłby Pan / byłaby Pani otwarty/a zobaczyć jak to wygląda?",
                },
              ],
            },
          ],
        },
      ],
    },
    {
      phase: 4,
      phaseClass: "phase-4",
      title: "Call Back",
      content: [
        {
          type: "text",
          speaker: "you",
          html: `Dzień dobry, tu <em>[Twoje imię]</em>, rozmawialiśmy jakiś czas temu o stronie internetowej dla ${company}. Ma Pan / Pani chwilę?`,
        },
        {
          type: "text",
          speaker: "you",
          html: "Chciałem się tylko dowiedzieć, czy temat strony jest dalej aktualny? Jeśli tak, to miałby Pan / miałaby Pani 10 minut, żebym zaprezentował przykładowy koncept?",
        },
        { type: "divider" },
        {
          type: "branch",
          dot: "objection",
          title: "Jeszcze się zastanawiam / niepewność",
          content: [
            {
              type: "text",
              speaker: "you",
              html: "Rozumiem, to nie ma pośpiechu. Czy mogę zapytać, co ewentualnie Pana / Panią powstrzymuje – cena, czas, czy może chce Pan / Pani zobaczyć więcej przykładów naszej pracy?",
            },
          ],
        },
      ],
    },
  ];

  return {
    title: "Cold Call – Fotografowie",
    subtitle: `Scheme rozmowy · Hook oparty na ${p.name}`,
    sections,
    differences: [],
  };
}

module.exports = { buildScript };
