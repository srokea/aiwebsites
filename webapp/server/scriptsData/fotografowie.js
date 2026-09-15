const { PLATFORM_INFO, pickPrimaryTag, activeTags, otherPlatformsMention } = require("./platformTokens");
const { escapeHtml } = require("../text");

function buildScript(lead) {
  const primary = pickPrimaryTag(lead);
  const p = PLATFORM_INFO[primary];
  const active = activeTags(lead);
  const hasYoutubeToo = active.includes("youtube") && primary !== "youtube";

  const company = lead.company_name ? `<em>${escapeHtml(lead.company_name)}</em>` : "<em>nazwa firmy</em>";
  const city = lead.city ? `<em>${escapeHtml(lead.city)}</em>` : "<em>miejscowość</em>";
  const platform = `<em>${p.name}</em>`;
  const otherPlatforms = otherPlatformsMention(lead, primary);

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
              html: `Świetnie. Dzwonię dosłownie na minutkę — trafiłem ostatnio na Wasz ${p.profileNoun} ${p.onPhrase}${otherPlatforms} i bardzo spodobały mi się Wasze zdjęcia. Zajmuję się stronami internetowymi dla lokalnych firm i przygotowałem dla Was szybki koncept strony, która zbierałaby w jednym miejscu portfolio, cennik pakietów, opinie i możliwość kontaktu. I pomyślałem, że zamiast opowiadać o tym przez telefon, po prostu ją pokażę — ma Pan / ma Pani może 10 minut któregoś dnia na krótkiego Google Meeta?`,
            },
            { type: "divider" },
            { type: "hookTag", variant: "backup", label: "Backup – szukam fotografa" },
            {
              type: "text",
              speaker: "you",
              html: `Wie Pan / wie Pani co, szukałem ostatnio fotografa na sesję i trafiłem na Wasz ${platform}, ale nie mogłem nigdzie znaleźć strony z pełnym portfolio i cennikiem pakietów. Nie dzwonię jednak jako klient — zajmuję się stronami internetowymi dla lokalnych firm i przygotowałem już jedną specjalnie dla Was. Ma Pan / ma Pani może 10 minut, żebym pokazał gotowy koncept?`,
            },
            { type: "divider" },
            { type: "hookTag", variant: "backup", label: "Backup – polecenie" },
            {
              type: "text",
              speaker: "you",
              html: `Ktoś polecił mi Wasze zdjęcia i próbowałem znaleźć więcej przykładów prac w internecie, ale ciężko było cokolwiek znaleźć poza ${platform}. Zajmuję się stronami internetowymi dla lokalnych firm i przygotowałem jedną specjalnie dla Was. Ma Pan / ma Pani 10 minut, żebym pokazał koncept?`,
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
      phase: 3,
      phaseClass: "phase-3",
      title: "Closer",
      content: [
        { type: "text", speaker: "you", html: "Super, w takim razie kiedy byłoby Panu / Pani wygodnie?" },
        {
          type: "text",
          speaker: "you",
          html: "Świetnie. To w <em>[data]</em> wyślę link na ten numer o <em>[godzina]</em>, wystarczy kliknąć i wszystko się samo otworzy. Do usłyszenia!",
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

  const differences = [
    { title: "Hook", html: "Bez wzmianki o studenckim portfolio – od razu profesjonalne wejście („zajmuję się stronami dla lokalnych firm\"), bo fotografowie to często jednoosobowe marki, dla których liczy się fachowość" },
    { title: "Backup hooki", html: "„Szukam fotografa\" i „polecenie\" – naturalne pretekst dla kogoś dzwoniącego w sprawie sesji zdjęciowej" },
    { title: "Główna obiekcja", html: `„${p.objectionTitle}" – odpowiedź kładzie nacisk na wyszukiwania „fotograf + miasto" w Google, nie na social media` },
    { title: "Branżowa obiekcja", html: "„Klienci i tak przychodzą z polecenia\" – bardzo częsta w tej niszy, mocno opartej na word-of-mouth" },
  ];

  return {
    title: "Cold Call – Fotografowie",
    subtitle: `Scheme rozmowy · Hook oparty na ${p.name}`,
    sections,
    differences,
  };
}

module.exports = { buildScript };
