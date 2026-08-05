// Edycja tresci schematow rozmow bezposrednio w plikach server/scriptsData/*.js.
//
// Zasada: edytowalna jest wylacznie TRESC blokow tekstowych ({ type: "text", html: ... }).
// Zmiany robimy na AST (recast zachowuje formatowanie reszty pliku co do bajta), nigdy
// regexem po tekscie. Tokeny per-lead (np. ${company}) pokazujemy uzytkownikowi jako
// przyjazne {firma} i mapujemy z powrotem przy zapisie - podstawiona wartosc konkretnego
// leada nie ma jak trafic do pliku, bo edytor operuje na surowym szablonie ze zrodla.

const fs = require("fs");
const path = require("path");
const Module = require("module");
const recast = require("recast");

const b = recast.types.builders;
const SCRIPTS_DIR = path.join(__dirname, "scriptsData");
// Domyslny parser recasta (esprima) nie zna np. optional chaining, a preset
// recast/parsers/babel klóci sie z nowszym @babel/parser (pipelineOperator) -
// wiec wlasny adapter z tym, czego faktycznie potrzebujemy.
const babelParser = require("@babel/parser");
const PARSE_OPTS = {
  parser: {
    parse: (source) =>
      babelParser.parse(source, {
        sourceType: "unambiguous",
        tokens: true, // recast wymaga tokenow do zachowania formatowania
        plugins: ["optionalChaining", "nullishCoalescingOperator"],
      }),
  },
};

// wyrazenie JS w szablonie -> token widoczny w edytorze (i z powrotem)
const EXPR_TO_TOKEN = {
  company: "{firma}",
  city: "{miasto}",
  nicheName: "{nisza}",
  "p.name": "{platforma}",
  "p.profileNoun": "{platforma.profil}",
  "p.onPhrase": "{platforma.gdzie}",
  "p.accusative": "{platforma.kogo}",
  "p.objectionTitle": "{platforma.obiekcja}",
};
const TOKEN_TO_EXPR = Object.fromEntries(Object.entries(EXPR_TO_TOKEN).map(([k, v]) => [v, k]));

function parseFile(filePath) {
  return recast.parse(fs.readFileSync(filePath, "utf8"), PARSE_OPTS);
}

// Wszystkie bloki { type: "text", ..., html: <wartosc> } w kolejnosci zrodla.
// Ta sama funkcja robi za zrodlo indeksow dla listowania, zapisu i instrumentacji -
// dzieki temu indeks bloku znaczy zawsze to samo.
function collectTextBlocks(ast) {
  const found = [];
  recast.types.visit(ast, {
    visitObjectExpression(nodePath) {
      const props = nodePath.node.properties.filter((p) => p.type === "ObjectProperty" || p.type === "Property");
      const typeProp = props.find((p) => p.key.name === "type" || p.key.value === "type");
      const htmlProp = props.find((p) => p.key.name === "html" || p.key.value === "html");
      const typeValue = typeProp && (typeProp.value.value ?? null);
      if (typeValue === "text" && htmlProp) {
        found.push({ objectPath: nodePath, htmlProp });
      }
      this.traverse(nodePath);
    },
  });
  return found;
}

// wartosc wezla html -> surowy szablon z tokenami {firma}/{miasto}/... ({js:...} dla nieznanych)
function nodeToRaw(valueNode) {
  if (valueNode.type === "StringLiteral" || valueNode.type === "Literal") return String(valueNode.value);
  if (valueNode.type === "TemplateLiteral") {
    let out = "";
    valueNode.quasis.forEach((q, i) => {
      out += q.value.cooked;
      if (i < valueNode.expressions.length) {
        const code = recast.print(valueNode.expressions[i]).code;
        out += EXPR_TO_TOKEN[code] || `{js:${code}}`;
      }
    });
    return out;
  }
  // nietypowa konstrukcja (np. warunek) - pokazujemy kod, ale nie pozwalamy edytowac
  return null;
}

// surowy tekst z tokenami -> wezel AST (string literal albo template literal)
function rawToNode(raw) {
  const tokenRe = /\{(?:firma|miasto|nisza|platforma(?:\.\w+)?)\}|\{js:([^}]+)\}/g;
  const parts = [];
  const exprs = [];
  let last = 0;
  let m;
  while ((m = tokenRe.exec(raw))) {
    parts.push(raw.slice(last, m.index));
    const code = m[1] || TOKEN_TO_EXPR[m[0]];
    if (!code) throw new Error(`Nieznany token: ${m[0]}`);
    const parsed = recast.parse(`(${code})`, PARSE_OPTS).program.body[0].expression;
    exprs.push(parsed);
    last = m.index + m[0].length;
  }
  parts.push(raw.slice(last));

  if (!exprs.length) return b.stringLiteral(raw);

  const escape = (s) => s.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${");
  const quasis = parts.map((p, i) =>
    b.templateElement({ raw: escape(p), cooked: p }, i === parts.length - 1)
  );
  return b.templateLiteral(quasis, exprs);
}

// GET-owa lista blokow pliku: [{ index, raw }] (raw=null dla nieedytowalnych konstrukcji)
function listBlocks(fileName) {
  const ast = parseFile(path.join(SCRIPTS_DIR, `${fileName}.js`));
  return collectTextBlocks(ast).map((entry, index) => ({ index, raw: nodeToRaw(entry.htmlProp.value) }));
}

// Probna kompilacja nowej wersji pliku + wywolanie buildScript na sztucznym leadzie.
// Rzuca bledem gdy plik sie nie kompiluje albo nie zwraca sensownej struktury.
function compileAndTest(code, filePath) {
  const m = new Module(filePath, module);
  m.filename = filePath;
  m.paths = Module._nodeModulePaths(path.dirname(filePath));
  m._compile(code, filePath);
  const dummyLead = {
    company_name: "Testowa Firma", city: "Testowo", phone: "",
    tag_instagram: 1, tag_facebook: 0, tag_booksy: 0, tag_youtube: 0,
  };
  const script = m.exports.buildScript(dummyLead, { name: "Test", slug: "test" });
  if (!script || !Array.isArray(script.sections)) {
    throw new Error("buildScript nie zwrocil poprawnej struktury");
  }
}

// Zapis edycji: podmiana JEDNEGO wezla html + walidacja + zapis atomowy z kopia .bak.
// Przy bledzie na dowolnym etapie oryginalny plik zostaje nietkniety.
function saveBlock(fileName, index, raw) {
  const filePath = path.join(SCRIPTS_DIR, `${fileName}.js`);
  const ast = parseFile(filePath);
  const blocks = collectTextBlocks(ast);
  const entry = blocks[index];
  if (!entry) throw Object.assign(new Error(`Nie ma bloku o indeksie ${index}`), { status: 404 });
  if (nodeToRaw(entry.htmlProp.value) === null) {
    throw Object.assign(new Error("Ten blok ma dynamiczna tresc (kod) - edytuj plik recznie"), { status: 400 });
  }

  entry.htmlProp.value = rawToNode(String(raw));
  const out = recast.print(ast).code;
  compileAndTest(out, filePath);

  fs.writeFileSync(`${filePath}.tmp`, out);
  fs.copyFileSync(filePath, `${filePath}.bak`);
  fs.renameSync(`${filePath}.tmp`, filePath);
}

// Wariant require'a, ktory dokleja kazdemu blokowi tekstowemu _src = <indeks w zrodle>.
// Identyfikator wedruje z obiektem przez cala logike buildScript (warunki, galezie),
// wiec frontend wie, ktory wezel zrodla odpowiada klikanemu blokowi.
function loadInstrumented(fileName) {
  const filePath = path.join(SCRIPTS_DIR, `${fileName}.js`);
  const ast = parseFile(filePath);
  collectTextBlocks(ast).forEach((entry, index) => {
    entry.objectPath.node.properties.push(
      b.objectProperty(b.identifier("_src"), b.numericLiteral(index))
    );
  });
  const m = new Module(filePath, module);
  m.filename = filePath;
  m.paths = Module._nodeModulePaths(path.dirname(filePath));
  m._compile(recast.print(ast).code, filePath);
  return m.exports;
}

module.exports = { listBlocks, saveBlock, loadInstrumented };
