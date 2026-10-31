# How to add a new translation?

Assume that we are adding a new translation with language code `new`.

1. Copy `src/locales/en.ts` to `src/locales/new.ts`.
2. Edit `src/locales/new.ts`:
   - Change `const en: LocaleType = ` to `const newLang: PartialLocaleType = `;
   - Update the export to `export default newLang;`;
   - Translate the strings to your language.
3. Edit `src/locales/index.ts`:
   - Import the new locale: `import newLang from "./new";`
   - Add `new: newLang` to the `ALL_LANGS` dictionary;
   - Add `new: "New Language Name"` to `ALL_LANG_OPTIONS`.
4. Run tests to verify the dictionary structure:
   ```bash
   pnpm test:ci
   ```
5. Submit a pull request.
