export type PetType = 'Cat' | 'Dog' | 'Rabbit' | 'Exotic' | 'Farm Animal';

export function normalizePetType(type: string | undefined, nameOrBreed?: string): PetType {
  const t = String(type || '').trim().toLowerCase();
  const extra = String(nameOrBreed || '').trim().toLowerCase();
  
  if (t.includes('kucing') || t === 'cat' || t === 'c' || t === 'feline' || t.includes('kitten') || t.includes('dalgona') || extra.includes('dalgona')) return 'Cat';
  if (t.includes('anjing') || t === 'dog' || t === 'd' || t === 'canine' || t.includes('puppy')) return 'Dog';
  if (t.includes('kelinci') || t === 'rabbit' || t === 'r' || t.includes('bunny')) return 'Rabbit';
  if (
    t.includes('eksotik') ||
    t.includes('exotic') ||
    t.includes('burung') ||
    t === 'bird' ||
    t.includes('hamster') ||
    t.includes('reptil') ||
    t.includes('reptile') ||
    t.includes('sugar glider') ||
    t.includes('musang') ||
    t.includes('iguana') ||
    t.includes('ular') ||
    t.includes('kura') ||
    t.includes('gecko') ||
    t.includes('otter') ||
    t.includes('ferret') ||
    t.includes('landak')
  ) {
    return 'Exotic';
  }
  if (
    t.includes('ternak') ||
    t.includes('farm') ||
    t.includes('sapi') ||
    t.includes('kambing') ||
    t.includes('domba') ||
    t.includes('kuda') ||
    t.includes('horse') ||
    t.includes('ayam') ||
    t.includes('bebek')
  ) {
    return 'Farm Animal';
  }

  // Jika kolom jenis kosong, deteksi secara cerdas dari nama hewan, ras, atau catatan medis
  if (nameOrBreed) {
    const extra = String(nameOrBreed).toLowerCase();

    // Cek nama kucing eksplisit terlebih dahulu (seperti Pus, Mpus, Kitten, dsb)
    if (/\b(pus|mpus|kucing|kitten|cat|persia|persian|anggora|angora|bsh|british|scottish|sphynx|bengal|mainecoon|ragdoll|siamese|munchkin|himalaya|himalayan|tabby|calico|tortie|tuxedo)\b/i.test(extra)) {
      return 'Cat';
    }

    // Keyword anjing (word-boundary safe)
    if (/\b(anjing|dog|dogs|puppy|canine|poodle|pudel|pom|pompom|pomeranian|golden|husky|shihtzu|shih tzu|pug|pugi|pitbull|chihuahua|bully|doberman|rottweiler|samoyed|maltese|beagle|corgi|dachshund|dachsund|labrador|dalmatian|schnauzer|chow|akita|shiba|kintamani|herder|alaskan|malamute|terrier|retriever|pinscher|maltipoo|frenchie|yorkie|bichon|pekingese|anabul dog)\b/i.test(extra)) {
      return 'Dog';
    }

    // Keyword kelinci
    if (/\b(kelinci|rabbit|bunny|holland lop|flemish|netherland|rex|lionhead)\b/i.test(extra)) {
      return 'Rabbit';
    }

    // Keyword hewan eksotik
    if (/\b(burung|bird|birdy|hamster|sugar glider|musang|iguana|reptil|reptile|ular|snake|kura|turtle|tortoise|gecko|lovebird|kenari|merpati|kakaktua|jalak|parkit|ferret|otter|landak|hedgehog|marmut|guinea pig)\b/i.test(extra) || extra.includes('kura²') || extra.includes('kura-kura')) {
      return 'Exotic';
    }

    // Keyword ternak
    if (/\b(sapi|kambing|domba|kuda|horse|babi|ayam|bebek|unggas|itik|ternak)\b/i.test(extra)) {
      return 'Farm Animal';
    }
  }

  return 'Cat';
}

export function getPetEmoji(type: string | undefined, nameOrBreed?: string): string {
  const norm = normalizePetType(type, nameOrBreed);
  switch (norm) {
    case 'Cat':
      return '🐱';
    case 'Dog':
      return '🐶';
    case 'Rabbit':
      return '🐰';
    case 'Exotic':
      return '🦜';
    case 'Farm Animal':
      return '🐄';
    default:
      return '🐾';
  }
}

export function getPetTypeIndonesian(type: string | undefined, nameOrBreed?: string): string {
  const norm = normalizePetType(type, nameOrBreed);
  switch (norm) {
    case 'Cat':
      return 'Kucing';
    case 'Dog':
      return 'Anjing';
    case 'Rabbit':
      return 'Kelinci';
    case 'Exotic':
      return 'Eksotik';
    case 'Farm Animal':
      return 'Hewan Ternak';
    default:
      return type || 'Kucing';
  }
}

export function getPetTypeLabelWithEmoji(type: string | undefined, nameOrBreed?: string): string {
  return `${getPetEmoji(type, nameOrBreed)} ${getPetTypeIndonesian(type, nameOrBreed)}`;
}
