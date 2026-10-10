// npm test (node --test, bez dodatkowych paczek)
const test = require("node:test");
const assert = require("node:assert/strict");
const { slownie } = require("./slownie");

test("kwoty z rachunkow (z briefu)", () => {
  assert.equal(slownie(10000), "sto złotych 00/100");
  assert.equal(slownie(30000), "trzysta złotych 00/100");
  assert.equal(slownie(60000), "sześćset złotych 00/100");
  assert.equal(slownie(200000), "dwa tysiące złotych 00/100");
  assert.equal(slownie(125050), "tysiąc dwieście pięćdziesiąt złotych 50/100");
});

test("odmiana: złoty / złote / złotych", () => {
  assert.equal(slownie(100), "jeden złoty 00/100");
  assert.equal(slownie(200), "dwa złote 00/100");
  assert.equal(slownie(2200), "dwadzieścia dwa złote 00/100");
  assert.equal(slownie(125200), "tysiąc dwieście pięćdziesiąt dwa złote 00/100");
  assert.equal(slownie(1200), "dwanaście złotych 00/100");
  assert.equal(slownie(1400), "czternaście złotych 00/100");
  assert.equal(slownie(0), "zero złotych 00/100");
  assert.equal(slownie(5), "zero złotych 05/100");
});

test("tysiące i wieksze", () => {
  assert.equal(slownie(500000), "pięć tysięcy złotych 00/100");
  assert.equal(slownie(2100000), "dwadzieścia jeden tysięcy złotych 00/100");
  assert.equal(slownie(1210000), "dwanaście tysięcy sto złotych 00/100");
  assert.equal(slownie(8552800), "osiemdziesiąt pięć tysięcy pięćset dwadzieścia osiem złotych 00/100");
  assert.equal(slownie(100000000), "milion złotych 00/100");
});
