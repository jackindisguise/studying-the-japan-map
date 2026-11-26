// Hiragana to Hepburn romaji, for the governors' names: "こいけ ゆりこ" -> "Yuriko Koike" (given name first).
// Long o and u get a macron (こうじ -> Kōji, ゆうき -> Yūki). Names the rules get wrong go in OVERRIDES.
// Usage: node scripts/romaji.js "こいけ ゆりこ"
import { pathToFileURL } from 'node:url';

const KANA = Object.fromEntries(`あa いi うu えe おo かka きki くku けke こko さsa しshi すsu せse そso たta ちchi つtsu てte とto
なna にni ぬnu ねne のno はha ひhi ふfu へhe ほho まma みmi むmu めme もmo やya ゆyu よyo らra りri るru れre ろro わwa をo
がga ぎgi ぐgu げge ごgo ざza じji ずzu ぜze ぞzo だda ぢji づzu でde どdo ばba びbi ぶbu べbe ぼbo ぱpa ぴpi ぷpu ぺpe ぽpo`
  .split(/\s+/).map((pair) => [pair[0], pair.slice(1)]));
const SMALL = { ゃ: 'a', ゅ: 'u', ょ: 'o' };
// Whole readings, keyed by the kana.
const OVERRIDES = { よしむらひろふみ: 'Hirofumi Yoshimura' }; // written without a space in the source

function word(kana) {
  let out = '', double = false;
  for (let i = 0; i < kana.length; i++) {
    const c = kana[i];
    if (c === 'っ') { double = true; continue; }
    if (c === 'ん') { out += /^[あいうえおやゆよ]/.test(kana.slice(i + 1)) ? "n'" : 'n'; continue; }
    let syllable = KANA[c];
    if (!syllable) throw new Error(`No romaji for "${c}" in ${kana}`);
    const small = SMALL[kana[i + 1]];
    if (small) {
      // きゃ -> kya, but しゃ -> sha, ちゃ -> cha, じゃ -> ja.
      syllable = /^(shi|chi|ji)$/.test(syllable) ? syllable.slice(0, -1) + small : `${syllable.slice(0, -1)}y${small}`;
      i++;
    }
    if (double) { syllable = (syllable.startsWith('ch') ? 't' : syllable[0]) + syllable; double = false; }
    out += syllable;
  }
  const long = out.replace(/ou|oo/g, 'ō').replace(/uu/g, 'ū');
  return long[0].toUpperCase() + long.slice(1);
}

// A reading is "family given" in kana; English puts the given name first.
export const romanName = (reading) => OVERRIDES[reading] || reading.split(/[\s　]+/).filter(Boolean).map(word).reverse().join(' ');

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) console.log(romanName(process.argv.slice(2).join(' ')));
