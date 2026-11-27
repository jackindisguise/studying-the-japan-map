// Turns Wiktionary's pitch-marked romaji for a Japanese name into the plain-English respelling the other map decks use,
// e.g. "náꜜgànò" -> "NAH-gah-noh". Syllables are separated by hyphens, and the syllable after which the pitch drops (ꜜ)
// is in capitals. A name whose pitch never drops has no capitals: no syllable is picked that the data does not mark.
//
// Key (what each respelling letter group stands for):
//   ah father   ee see   oo goose   eh bed   oh goat   ai price (y after a consonant)
//   ch j sh ts y as in "cheese", "jam", "ship", "cats", "yes"; g is always hard; every other letter is itself.
// A long vowel is one syllable, as are "ai", a vowel with a following "n" and a vowel before a doubled consonant.
// Usage: node scripts/respell.js "náꜜgànò"
import { pathToFileURL } from 'node:url';

const VOWELS = { a: 'ah', i: 'ee', u: 'oo', e: 'eh', o: 'oh' };
const DROP = 'ꜜ';

export function respell(pitch) {
  const s = pitch.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  const syllables = []; // { onset, vowel, coda, accent }
  let onset = '';
  for (let i = 0; i < s.length; ) {
    const last = syllables.at(-1);
    if (s[i] === DROP) {
      if (!last) throw new Error(`respell: nothing before the drop in ${pitch}`);
      last.accent = true; i++; continue;
    }
    if (VOWELS[s[i]]) {
      // The second half of a long vowel, or the "i" of "ai", belongs to the syllable before it.
      const open = !onset && last && !last.coda;
      if (open && last.vowel === s[i]) { i++; continue; }
      if (open && last.vowel === 'a' && s[i] === 'i') { last.vowel = 'ai'; i++; continue; }
      syllables.push({ onset, vowel: s[i], coda: '', accent: false });
      onset = ''; i++; continue;
    }
    if (!/[b-df-hj-np-tvwyz]/.test(s[i])) throw new Error(`respell: unknown letter "${s[i]}" in ${pitch}`);
    const next = s[i + 1] || '';
    // "n" that starts no syllable, and the first of a doubled consonant, close the syllable before them.
    const closing = !onset && ((s[i] === 'n' && !/[aiueoy]/.test(next)) || (next === s[i] && s[i] !== 'n') || (s[i] === 't' && next === 'c'));
    if (closing) { if (!last) throw new Error(`respell: "${s[i]}" starts ${pitch}`); last.coda += s[i]; } else onset += s[i];
    i++;
  }
  if (onset || !syllables.length) throw new Error(`respell: could not read ${pitch}`);
  return syllables.map(({ onset: o, vowel, coda, accent }) => {
    // The vowel in "price" is "ai" on its own, but "y" after a consonant, with a silent e if the syllable is closed.
    const y = vowel === 'ai' && o;
    const text = o + (y ? 'y' : vowel === 'ai' ? 'ai' : VOWELS[vowel]) + coda + (y && coda ? 'e' : '');
    return accent ? text.toUpperCase() : text;
  }).join('-');
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) console.log(respell(process.argv.slice(2).join(' ')));
