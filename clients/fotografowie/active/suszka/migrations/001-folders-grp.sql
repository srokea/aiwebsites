-- Podzial portfolio na dwie grupy sesji (strona: najpierw wybor grupy,
-- potem galeria). Istniejace foldery laduja w grupie 1.
-- Na istniejacej bazie:  wrangler d1 execute portfolio-suszka-db --remote --file=migrations/001-folders-grp.sql
ALTER TABLE folders ADD COLUMN grp INTEGER NOT NULL DEFAULT 1;
