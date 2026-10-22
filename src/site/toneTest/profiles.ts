/**
 * Toneder's dating profiles: the prop the bird poses with in each word's
 * "profile picture", and a one-line bio. Shown only after the answer — on the
 * hidden card a prop would give the word (and so the tone) away.
 * `profiles.test.ts` keeps this in step with TEST_WORDS.
 */

export interface Profile {
  /** The prop in the photo (an emoji, drawn next to the bird). */
  prop: string;
  bio: string;
}

export const PROFILES: Record<string, Profile> = {
  ma1b: { prop: "👩‍🍼", bio: "Family first. Will ask if you've eaten." },
  ba1: { prop: "🎱", bio: "Lucky number. Literally." },
  san1: { prop: "🥉", bio: "Third wheel, but in a fun way." },
  tian1: { prop: "☀️", bio: "Every day is a good day." },
  hua1: { prop: "💐", bio: "Brings flowers on the first date." },
  shu1: { prop: "📚", bio: "Looking for someone who reads." },
  kai1: { prop: "🔓", bio: "Open to anything." },
  mao1: { prop: "🐈", bio: "Yes, the cat comes too." },
  gao1: { prop: "🦒", bio: "6'2\", since you asked." },
  fei1: { prop: "✈️", bio: "Frequent flyer. Obviously." },
  ma2: { prop: "🌿", bio: "Into rope and natural fibres." },
  shi2: { prop: "🔟", bio: "A perfect ten." },
  ren2: { prop: "🧍", bio: "Just a person looking for another person." },
  lai2: { prop: "👋", bio: "Come over. Snacks provided." },
  qian2: { prop: "💰", bio: "Will split the bill. Maybe." },
  xue2: { prop: "🎓", bio: "Lifelong learner. Ask me anything." },
  hong2: { prop: "🧧", bio: "Red flags? Only red envelopes." },
  bai2: { prop: "🤍", bio: "Clean slate, no drama." },
  niu2: { prop: "🐄", bio: "Strong, steady, a bit stubborn." },
  nian2: { prop: "🧨", bio: "Here for the long year." },
  ma3b: { prop: "🐎", bio: "Gallops into your DMs." },
  wu3: { prop: "🖐️", bio: "High five on the first date." },
  jiu3: { prop: "☁️", bio: "On cloud nine." },
  wo3: { prop: "🪞", bio: "It's all about me." },
  ni3: { prop: "🫵", bio: "Looking for you. Yes, you." },
  hao3: { prop: "👍", bio: "Good vibes only." },
  shou3: { prop: "🤝", bio: "Hand-holding enthusiast." },
  kou3: { prop: "👄", bio: "Talks a lot. In four tones." },
  zao3: { prop: "🌅", bio: "Morning person. Sorry." },
  lao3: { prop: "👴", bio: "Old soul, young beak." },
  ma4b: { prop: "🤬", bio: "Speaks my mind. Loudly." },
  si4: { prop: "🍀", bio: "Four leaves, all lucky." },
  liu4: { prop: "🎲", bio: "Rolls sixes. Ask me how." },
  er4: { prop: "✌️", bio: "Takes two to tango." },
  da4: { prop: "🐘", bio: "Big heart, bigger wings." },
  shi4: { prop: "✅", bio: "Yes. Just yes." },
  dui4: { prop: "💯", bio: "Always right. Ask anyone." },
  kuai4: { prop: "⚡", bio: "Fast replies, guaranteed." },
  hua4: { prop: "💬", bio: "Good conversation is my love language." },
  dian4: { prop: "🔌", bio: "Instant spark." },
};
