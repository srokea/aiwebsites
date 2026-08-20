const { PLATFORM_INFO, pickPrimaryTag } = require("./platformTokens");
const { escapeHtml } = require("../text");

// Generyczny scheme rozmowy dla nisz, dla ktorych nie ma jeszcze dedykowanej tresci
// (na wzor kosmetyczek, ale bez branzowych szczegolow). Mozna pozniej podmienic
// na plik dedykowany danej niszy w server/scriptsData/<slug>.js.
function buildScript(lead, niche) {
  const primary = pickPrimaryTag(lead);
  const p = PLATFORM_INFO[primary];
  const nicheName = (niche?.name || "biznesów").toLowerCase();

  const company = lead.company_name ? `<em>${escapeHtml(lead.company_name)}</em>` : "<em>nazwa firmy</em>";
  const city = lead.city ? `<em>${escapeHtml(lead.city)}</em>` : "<em>miejscowość</em>";

  const sections = [
    {
      phase: 1,
      phaseClass: "phase-1",
      title: "Opener",
      content: [
        { type: "text", speaker: "you", html: `Dzień dobry, dodzwoniłem się do ${company}?` },
        { type: "text", speaker: "you", html: "Super, a czy rozmawiam z właścicielem / właścicielką?" },
        { type: "flowArrow" },
        {
          type: "branch",
          dot: "no",
          title: "NIE – to nie właściciel/ka",
          open: false,
          content: [
            { type: "text", speaker: "you", html: "Jasne, a kiedy mogę się z nią / z nim skontaktować?" },
            { type: "text", speaker: "them", html: "Proszę zadzwonić później." },
            { type: "text", speaker: "you", html: `Dzwonię w sprawie ${p.name} / działalności internetowej.` },
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
              html: `Świetnie, widziałem ostatnio Wasz ${p.profileNoun} ${p.onPhrase} – wygląda naprawdę dobrze. Jestem studentem informatyki z okolicy ${city} i żeby wspomóc swoje portfolio, robię strony internetowe dla lokalnych ${nicheName}. Przygotowałem już przykładowy koncept strony dla Was – miejsce, które spina ${p.name}, cennik, opinie i kontakt w jedno. Miałby Pan / Miałaby Pani 5-10 minut w tygodniu, żebym go zaprezentował?`,
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
          content: [{ type: "text", speaker: "you", html: "Jasne, rozumiem. Z ciekawości zapytam tylko – chodzi np. o budżet, czy po prostu nie jest to teraz priorytet?" }],
        },
        {
          type: "branch",
          dot: "objection",
          title: p.objectionTitle,
          content: [
            {
              type: "text",
              speaker: "you",
              html: `Rozumiem, to super że już tam działacie. Strona nie zastępuje ${p.name}, tylko zbiera wszystko w jednym miejscu: cennik, opinie, zdjęcia, kontakt – i pomaga wypaść lepiej w Google. Czy byłby Pan / byłaby Pani otwarty/a zobaczyć przykładowy koncept?`,
            },
          ],
        },
        {
          type: "branch",
          dot: "objection",
          title: "Nie mam czasu",
          content: [{ type: "text", speaker: "you", html: "Jasne, rozumiem. W takim razie zadzwonię w innym terminie?" }],
        },
        {
          type: "branch",
          dot: "objection",
          title: "Ile to kosztuje?",
          content: [
            {
              type: "text",
              speaker: "you",
              html: "W większości przypadków jest to 300-500 zł za przygotowanie strony i niewielki koszt miesięczny za utrzymanie i opiekę. Najpierw chciałbym jednak pokazać przygotowany koncept i sprawdzić, czy w ogóle odpowiadałby taki kierunek.",
            },
          ],
        },
        {
          type: "branch",
          dot: "objection",
          title: "Muszę to przemyśleć",
          content: [{ type: "text", speaker: "you", html: "Jasne, rozumiem. Mogę tylko zapytać, co konkretnie chciałby Pan / chciałaby Pani przemyśleć?" }],
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
          html: "Chciałem się tylko dowiedzieć, czy temat strony jest dalej aktualny? Jeśli tak, to miałby Pan / miałaby Pani 5-10 minut w tygodniu, żebym zaprezentował przykładowy koncept?",
        },
      ],
    },
  ];

  return {
    title: `Cold Call – ${niche?.name || "Scheme rozmowy"}`,
    subtitle: `Scheme rozmowy · Hook oparty na ${p.name}`,
    sections,
    differences: [],
  };
}

module.exports = { buildScript };
