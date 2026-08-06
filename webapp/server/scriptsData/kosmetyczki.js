const { PLATFORM_INFO, pickPrimaryTag, activeTags } = require("./platformTokens");
const { escapeHtml } = require("../text");

function buildScript(lead) {
  const primary = pickPrimaryTag(lead);
  const p = PLATFORM_INFO[primary];
  const active = activeTags(lead);
  const hasBooksyToo = active.includes("booksy") && primary !== "booksy";

  const company = lead.company_name ? `<em>${escapeHtml(lead.company_name)}</em>` : "<em>nazwa firmy</em>";
  const city = lead.city ? `<em>${escapeHtml(lead.city)}</em>` : "<em>miejscowość</em>";

  const sections = [
    {
      phase: 1,
      phaseClass: "phase-1",
      title: "Opener",
      content: [
        { type: "text", speaker: "you", html: `Dzień dobry, dodzwoniłem się do ${company}?` },
        { type: "text", speaker: "you", html: `Super, a czy rozmawiam z właścicielką / Panią <em>imię</em>?` },
        { type: "flowArrow" },
        {
          type: "branch",
          dot: "no",
          title: "NIE – to nie właścicielka",
          open: false,
          content: [
            { type: "text", speaker: "you", html: "Jasne, a kiedy mogę się z nią skontaktować?" },
            { type: "text", speaker: "them", html: "Szefowa będzie jutro / Teraz jest z klientką, proszę zadzwonić za chwilę." },
            { type: "divider" },
            { type: "text", speaker: "them", html: "A o co chodzi? W jakiej sprawie pan dzwoni?" },
            { type: "text", speaker: "you", html: `Dzwonię w sprawie ${p.name} / działalności internetowej.` },
          ],
        },
        {
          type: "branch",
          dot: "yes",
          title: "TAK – rozmawiam z właścicielką",
          open: true,
          content: [
            { type: "hookTag", variant: "main", label: `Główny hook – ${p.name}` },
            {
              type: "text",
              speaker: "you",
              html: `Świetnie, wie Pani co, widziałem ostatnio Wasz ${p.profileNoun} ${p.onPhrase} – naprawdę świetne zdjęcia efektów. Tak się składa, że jestem studentem informatyki z okolicy ${city} i żeby wspomóc swoje portfolio, zacząłem robić strony internetowe dla lokalnych biznesów tu w ${city}. Przygotowałem już jedną specjalnie dla Was – takie miejsce, które spina ${p.name}, cennik, opinie i kontakt w jedno. Miałaby Pani może 5-10 minut w tygodniu, żebym zaprezentował przykładowy koncept?`,
            },
            { type: "divider" },
            { type: "hookTag", variant: "backup", label: "Backup – prezent / voucher" },
            {
              type: "text",
              speaker: "you",
              html: `Wie Pani co, szukałem czegoś na prezent dla dziewczyny/mamy – chciałem sprawdzić jakie zabiegi oferujecie, ale nie mogłem nigdzie znaleźć strony z cennikiem. Nie dzwonię jednak jako klient – jestem studentem informatyki z okolicy ${city} i żeby wspomóc swoje portfolio, zacząłem robić strony internetowe dla lokalnych biznesów. Przygotowałem już jedną specjalnie dla Was. Miałaby Pani może 5-10 minut w tygodniu, żebym zaprezentował przykładowy koncept?`,
            },
            { type: "divider" },
            { type: "hookTag", variant: "backup", label: "Backup – polecenie" },
            {
              type: "text",
              speaker: "you",
              html: `Ktoś mi polecił Wasz salon i próbowałem znaleźć więcej informacji w internecie, ale ciężko było cokolwiek znaleźć poza ${p.name}. Jestem studentem informatyki z okolicy ${city} i robię strony dla lokalnych biznesów. Przygotowałem jedną specjalnie dla Was. Miałaby Pani 5-10 minut w tygodniu żebym pokazał koncept?`,
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
            { type: "note", html: "⚡ Najczęstsza obiekcja u kosmetyczek" },
            {
              type: "text",
              speaker: "you",
              html: `Rozumiem i to super, że już tam działacie – zdjęcia efektów wyglądają świetnie. Strona nie zastępuje ${p.name}, tylko zbiera wszystko w jednym miejscu: cennik, opinie, zdjęcia, kontakt. Klientki, które szukają Was w Google, trafiają od razu na stronę zamiast szukać po ${p.name}. Czy byłaby Pani otwarta zobaczyć przykładowy koncept?`,
            },
          ],
        },
        ...(hasBooksyToo
          ? [
              {
                type: "branch",
                dot: "objection",
                title: "Mamy Booksy",
                content: [
                  {
                    type: "text",
                    speaker: "you",
                    html: "Jasne i absolutnie nie chciałbym zastępować Booksy. Ono świetnie sprawdza się do umawiania wizyt. Strona miałaby być miejscem, gdzie klientka najpierw zobaczy salon, opinie, zdjęcia efektów, cennik – i dopiero stamtąd jednym kliknięciem przejdzie do Booksy.",
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
              html: "W większości przypadków jest to 300-500 zł za przygotowanie strony i koszty miesięczne za utrzymanie, aktualizacje i opiekę. Sumują się do około 100-200 zł. Najpierw chciałbym jednak pokazać przygotowany koncept i sprawdzić, czy w ogóle odpowiadałby Pani taki kierunek.",
            },
          ],
        },
        {
          type: "branch",
          dot: "objection",
          title: "A ile masz lat? / Jesteś studentem?",
          content: [
            {
              type: "text",
              speaker: "you",
              html: "Mam 18 lat i studiuję informatykę. Strony robię dodatkowo dla lokalnych biznesów, bo chcę rozwijać własną działalność. Dlatego zależy mi na tym, żeby każdy projekt był naprawdę dobrze wykonany.",
            },
          ],
        },
        {
          type: "branch",
          dot: "objection",
          title: "Muszę to przemyśleć",
          content: [
            { type: "text", speaker: "you", html: "Jasne, rozumiem. Mogę tylko zapytać, co konkretnie chciałaby Pani przemyśleć?" },
            { type: "divider" },
            {
              type: "branch",
              dot: "neutral",
              title: "Nie wiem czy potrzebujemy strony",
              content: [
                {
                  type: "text",
                  speaker: "you",
                  html: "Rozumiem. Dlatego właśnie proponuję krótkie spotkanie, żebym pokazał konkretny przykład. Potem będzie dużo łatwiej ocenić, czy ma to sens dla Waszego salonu.",
                },
              ],
            },
            {
              type: "branch",
              dot: "neutral",
              title: "Muszę pogadać ze wspólniczką / z mężem",
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
                  html: "Jasne, rozumiem. A mogę zapytać z ciekawości – bardziej chodzi o cenę, czy nie jest Pani pewna, czy taka strona miałaby sens dla salonu?",
                },
                { type: "dropWarning", html: "🚫 Jeśli cena jest problemem – dropujemy klienta" },
                { type: "divider" },
                { type: "text", speaker: "them", html: "Nie no, cena nie jest problemem." },
                {
                  type: "text",
                  speaker: "you",
                  html: "Okej. A gdyby nic nie kosztowało obejrzenie przykładu przez 10 minut, byłaby Pani otwarta zobaczyć jak to wygląda?",
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
        { type: "text", speaker: "you", html: "Super, w takim razie kiedy byłoby Pani wygodnie?" },
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
          html: `Dzień dobry, tu <em>[Twoje imię]</em>, rozmawialiśmy jakiś czas temu o stronie internetowej dla ${company}. Ma Pani chwilę?`,
        },
        {
          type: "text",
          speaker: "you",
          html: "Wspominała Pani wtedy o <em>[powód]</em>, więc nie chciałem się narzucać wcześniej – chciałem się tylko dowiedzieć, czy temat strony jest dalej aktualny? Jeśli tak, to miałaby Pani 5-10 minut w tygodniu, żebym zaprezentował przykładowy koncept?",
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
              html: "Rozumiem, to nie ma pośpiechu. Czy mogę zapytać, co ewentualnie Panią powstrzymuje – cena, czas, czy może chce Pani zobaczyć więcej przykładów naszej pracy?",
            },
          ],
        },
      ],
    },
  ];

  const differences = [
    { title: "Hook", html: `${p.name}-based zamiast ogólnego wejścia – bo to naturalny kanał tej branży` },
    { title: "Ton", html: "Częściej „Pani\" – zdecydowana większość właścicielek to kobiety" },
    { title: "Główna obiekcja", html: `„${p.objectionTitle}" – odpowiedź kładzie nacisk na Google i spinanie cennika/opinii/zdjęć w jedno` },
    { title: "Backup hook", html: "„Prezent/voucher\" – naturalny pretekst dla dzwoniącego szukającego bonu na zabiegi" },
  ];

  return {
    title: "Cold Call – Kosmetyczki",
    subtitle: `Scheme rozmowy · Hook oparty na ${p.name}`,
    smsNote: "⏳ Jeśli nie odbiorą – czekaj 30 min – SMS",
    sections,
    differences,
  };
}

module.exports = { buildScript };
